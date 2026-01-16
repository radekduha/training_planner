const crypto = require("crypto");
const path = require("path");
const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");

const config = require("./env");
const { prisma } = require("./db");
const { geocodeAddress } = require("./geocoding");
const { LONG_TRIP_THRESHOLD_KM, haversineKm, recommendTrainers } = require("./matching");
const {
  statusChoices,
  trainingListItem,
  trainingPayload,
  trainingTypePayload,
  trainerPayload,
  trainerSummary,
} = require("./serializers");
const {
  addError,
  endOfDay,
  formatDate,
  formatTime,
  hasErrors,
  parseDateOnly,
  parseDateTime,
  startOfDay,
  startOfWeekMonday,
  toInt,
  toNumber,
} = require("./utils");

const VALID_STATUSES = new Set([
  "draft",
  "waiting",
  "assigned",
  "confirmed",
  "canceled",
]);

const app = express();

app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(
  session({
    name: "tp_session",
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  })
);

if (config.sessionSecret === "change-me") {
  console.warn("SESSION_SECRET is not set. Set it in .env for production.");
}

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const generateCsrfToken = () => crypto.randomBytes(24).toString("hex");

const setCsrfCookie = (res, token) => {
  res.cookie("csrftoken", token, {
    httpOnly: false,
    sameSite: "lax",
  });
};

app.use((req, res, next) => {
  if ((req.method === "GET" || req.method === "HEAD") && !req.cookies.csrftoken) {
    setCsrfCookie(res, generateCsrfToken());
  }
  next();
});

const requireCsrf = (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") {
    return next();
  }
  const cookieToken = req.cookies.csrftoken;
  const headerToken = req.get("X-CSRFToken");
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: "CSRF failed." });
  }
  return next();
};

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  return res.redirect(302, "/login");
};

const parseBoolean = (value) => {
  if (value === true || value === false) {
    return value;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
};

const buildRuleData = (trainerId, ruleType, value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (Array.isArray(value) && value.length === 0) {
    return null;
  }
  return {
    trainerId,
    ruleType,
    ruleValue: JSON.stringify({ value }),
  };
};

const syncTrainerRelations = async (trainerId, trainingTypeIds, rules) => {
  await prisma.trainerSkill.deleteMany({ where: { trainerId } });
  if (trainingTypeIds.length) {
    await prisma.trainerSkill.createMany({
      data: trainingTypeIds.map((trainingTypeId) => ({ trainerId, trainingTypeId })),
    });
  }

  await prisma.trainerRule.deleteMany({ where: { trainerId } });
  if (rules.length) {
    await prisma.trainerRule.createMany({ data: rules });
  }
};

const trainerIncludes = {
  skills: { include: { trainingType: true } },
  rules: true,
};

const trainingIncludes = {
  trainingType: true,
  assignedTrainer: true,
};

const api = express.Router();
api.use(requireCsrf);

api.get("/csrf/", (req, res) => {
  setCsrfCookie(res, generateCsrfToken());
  res.json({ ok: true });
});

api.post(
  "/login/",
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const username = (payload.username || "").trim();
    const password = payload.password || "";
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }
    if (username !== config.adminUsername || password !== config.adminPassword) {
      return res.status(400).json({ error: "Invalid credentials." });
    }
    req.session.user = { id: 1, username };
    return res.json({ ok: true, user: { id: 1, username } });
  })
);

api.post(
  "/logout/",
  asyncHandler(async (req, res) => {
    if (!req.session) {
      return res.json({ ok: true });
    }
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  })
);

api.get(
  "/meta/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [trainingTypes, trainers] = await Promise.all([
      prisma.trainingType.findMany({ orderBy: { name: "asc" } }),
      prisma.trainer.findMany({ orderBy: { name: "asc" } }),
    ]);
    res.json({
      training_types: trainingTypes.map(trainingTypePayload),
      trainer_choices: trainers.map(trainerSummary),
      status_choices: statusChoices(),
    });
  })
);

api.get(
  "/trainings/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const filters = [];
    if (req.query.status) {
      filters.push({ status: String(req.query.status) });
    }
    const trainingTypeId = toInt(req.query.training_type);
    if (trainingTypeId) {
      filters.push({ trainingTypeId });
    }
    const startDate = parseDateOnly(req.query.start_date);
    if (startDate) {
      filters.push({ startDatetime: { gte: startOfDay(startDate) } });
    }
    const endDate = parseDateOnly(req.query.end_date);
    if (endDate) {
      filters.push({ startDatetime: { lte: endOfDay(endDate) } });
    }
    if (req.query.no_trainer) {
      filters.push({
        assignedTrainerId: null,
        status: { in: ["draft", "waiting"] },
      });
    }
    const where = filters.length ? { AND: filters } : undefined;

    const trainings = await prisma.training.findMany({
      where,
      include: trainingIncludes,
      orderBy: { startDatetime: "desc" },
      take: 100,
    });
    res.json({ items: trainings.map(trainingListItem) });
  })
);

api.post(
  "/trainings/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const errors = {};
    const trainingTypeId = toInt(payload.training_type);
    if (!trainingTypeId) {
      addError(errors, "training_type", "This field is required.");
    }
    const address = (payload.address || "").trim();
    if (!address) {
      addError(errors, "address", "This field is required.");
    }
    const startDatetime = parseDateTime(payload.start_datetime);
    if (!startDatetime) {
      addError(errors, "start_datetime", "Enter a valid date and time.");
    }
    const endDatetime = parseDateTime(payload.end_datetime);
    if (!endDatetime) {
      addError(errors, "end_datetime", "Enter a valid date and time.");
    }
    if (startDatetime && endDatetime && endDatetime <= startDatetime) {
      addError(errors, "end_datetime", "End must be after start.");
    }

    const status = payload.status || "waiting";
    if (!VALID_STATUSES.has(status)) {
      addError(errors, "status", "Select a valid status.");
    }

    const assignedTrainerId =
      payload.assigned_trainer === null || payload.assigned_trainer === ""
        ? null
        : toInt(payload.assigned_trainer);
    if (
      payload.assigned_trainer !== null &&
      payload.assigned_trainer !== undefined &&
      payload.assigned_trainer !== "" &&
      !assignedTrainerId
    ) {
      addError(errors, "assigned_trainer", "Select a valid trainer.");
    }

    const lat = toNumber(payload.lat);
    if (payload.lat !== null && payload.lat !== undefined && payload.lat !== "" && lat === null) {
      addError(errors, "lat", "Enter a valid latitude.");
    }
    const lng = toNumber(payload.lng);
    if (payload.lng !== null && payload.lng !== undefined && payload.lng !== "" && lng === null) {
      addError(errors, "lng", "Enter a valid longitude.");
    }

    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }

    const trainingType = await prisma.trainingType.findUnique({
      where: { id: trainingTypeId },
    });
    if (!trainingType) {
      addError(errors, "training_type", "Select a valid training type.");
    }
    if (assignedTrainerId) {
      const trainer = await prisma.trainer.findUnique({ where: { id: assignedTrainerId } });
      if (!trainer) {
        addError(errors, "assigned_trainer", "Select a valid trainer.");
      }
    }
    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }

    let resolvedLat = lat;
    let resolvedLng = lng;
    if (resolvedLat === null || resolvedLng === null) {
      const geo = await geocodeAddress(address);
      if (geo) {
        resolvedLat = geo.lat;
        resolvedLng = geo.lng;
      }
    }

    const training = await prisma.training.create({
      data: {
        trainingTypeId,
        customerName: payload.customer_name || "",
        address,
        lat: resolvedLat,
        lng: resolvedLng,
        startDatetime,
        endDatetime,
        status,
        assignedTrainerId,
        assignmentReason: payload.assignment_reason || "",
        notes: payload.notes || "",
        googleEventId: payload.google_event_id || "",
      },
      include: trainingIncludes,
    });

    return res.status(201).json({ item: trainingPayload(training) });
  })
);

api.get(
  "/trainings/:id/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (!id) {
      return res.status(404).json({ error: "Training not found." });
    }
    const training = await prisma.training.findUnique({
      where: { id },
      include: trainingIncludes,
    });
    if (!training) {
      return res.status(404).json({ error: "Training not found." });
    }

    const [trainers, existingTrainings] = await Promise.all([
      prisma.trainer.findMany({ include: trainerIncludes }),
      prisma.training.findMany({
        where: { assignedTrainerId: { not: null }, status: { not: "canceled" } },
        select: {
          id: true,
          assignedTrainerId: true,
          startDatetime: true,
          endDatetime: true,
          lat: true,
          lng: true,
        },
      }),
    ]);

    const recommendations = recommendTrainers(training, trainers, existingTrainings);
    const matches = recommendations.matches.map((match) => ({
      trainer: trainerSummary(match.trainer),
      score: match.score,
      estimated_cost: match.estimatedCost,
      reasons: match.reasons,
      warnings: match.warnings,
    }));

    return res.json({
      item: trainingPayload(training),
      recommendations: {
        matches,
        used_compromise: recommendations.usedCompromise,
      },
    });
  })
);

api.put(
  "/trainings/:id/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (!id) {
      return res.status(404).json({ error: "Training not found." });
    }
    const existing = await prisma.training.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Training not found." });
    }

    const payload = req.body || {};
    const errors = {};
    const trainingTypeId = toInt(payload.training_type);
    if (!trainingTypeId) {
      addError(errors, "training_type", "This field is required.");
    }
    const address = (payload.address || "").trim();
    if (!address) {
      addError(errors, "address", "This field is required.");
    }
    const startDatetime = parseDateTime(payload.start_datetime);
    if (!startDatetime) {
      addError(errors, "start_datetime", "Enter a valid date and time.");
    }
    const endDatetime = parseDateTime(payload.end_datetime);
    if (!endDatetime) {
      addError(errors, "end_datetime", "Enter a valid date and time.");
    }
    if (startDatetime && endDatetime && endDatetime <= startDatetime) {
      addError(errors, "end_datetime", "End must be after start.");
    }

    const status = payload.status || "waiting";
    if (!VALID_STATUSES.has(status)) {
      addError(errors, "status", "Select a valid status.");
    }

    const assignedTrainerId =
      payload.assigned_trainer === null || payload.assigned_trainer === ""
        ? null
        : toInt(payload.assigned_trainer);
    if (
      payload.assigned_trainer !== null &&
      payload.assigned_trainer !== undefined &&
      payload.assigned_trainer !== "" &&
      !assignedTrainerId
    ) {
      addError(errors, "assigned_trainer", "Select a valid trainer.");
    }

    const lat = toNumber(payload.lat);
    if (payload.lat !== null && payload.lat !== undefined && payload.lat !== "" && lat === null) {
      addError(errors, "lat", "Enter a valid latitude.");
    }
    const lng = toNumber(payload.lng);
    if (payload.lng !== null && payload.lng !== undefined && payload.lng !== "" && lng === null) {
      addError(errors, "lng", "Enter a valid longitude.");
    }

    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }

    const trainingType = await prisma.trainingType.findUnique({
      where: { id: trainingTypeId },
    });
    if (!trainingType) {
      addError(errors, "training_type", "Select a valid training type.");
    }
    if (assignedTrainerId) {
      const trainer = await prisma.trainer.findUnique({ where: { id: assignedTrainerId } });
      if (!trainer) {
        addError(errors, "assigned_trainer", "Select a valid trainer.");
      }
    }
    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }

    let resolvedLat = lat;
    let resolvedLng = lng;
    if (resolvedLat === null || resolvedLng === null) {
      const geo = await geocodeAddress(address);
      if (geo) {
        resolvedLat = geo.lat;
        resolvedLng = geo.lng;
      }
    }

    const training = await prisma.training.update({
      where: { id },
      data: {
        trainingTypeId,
        customerName: payload.customer_name || "",
        address,
        lat: resolvedLat,
        lng: resolvedLng,
        startDatetime,
        endDatetime,
        status,
        assignedTrainerId,
        assignmentReason: payload.assignment_reason || "",
        notes: payload.notes || "",
        googleEventId: payload.google_event_id || "",
      },
      include: trainingIncludes,
    });

    return res.json({ item: trainingPayload(training) });
  })
);

api.patch(
  "/trainings/:id/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (!id) {
      return res.status(404).json({ error: "Training not found." });
    }

    const training = await prisma.training.findUnique({
      where: { id },
      include: trainingIncludes,
    });
    if (!training) {
      return res.status(404).json({ error: "Training not found." });
    }

    const payload = req.body || {};
    const errors = {};

    const status =
      payload.status === undefined || payload.status === null || payload.status === ""
        ? training.status
        : payload.status;
    if (!VALID_STATUSES.has(status)) {
      addError(errors, "status", "Select a valid status.");
    }

    let assignedTrainerId = training.assignedTrainerId;
    if (Object.prototype.hasOwnProperty.call(payload, "assigned_trainer")) {
      if (payload.assigned_trainer === null || payload.assigned_trainer === "") {
        assignedTrainerId = null;
      } else {
        assignedTrainerId = toInt(payload.assigned_trainer);
        if (!assignedTrainerId) {
          addError(errors, "assigned_trainer", "Select a valid trainer.");
        }
      }
    }

    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }

    if (assignedTrainerId) {
      const trainer = await prisma.trainer.findUnique({ where: { id: assignedTrainerId } });
      if (!trainer) {
        addError(errors, "assigned_trainer", "Select a valid trainer.");
      }
    }
    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }

    const updated = await prisma.training.update({
      where: { id },
      data: {
        status,
        assignedTrainerId,
        customerName:
          payload.customer_name === undefined ? training.customerName : payload.customer_name || "",
        assignmentReason:
          payload.assignment_reason === undefined
            ? training.assignmentReason
            : payload.assignment_reason || "",
        notes: payload.notes === undefined ? training.notes : payload.notes || "",
      },
      include: trainingIncludes,
    });

    return res.json({ item: trainingPayload(updated) });
  })
);

api.get(
  "/trainers/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const trainers = await prisma.trainer.findMany({ orderBy: { name: "asc" } });
    res.json({ items: trainers.map((trainer) => trainerPayload(trainer, false)) });
  })
);

api.post(
  "/trainers/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const errors = {};

    const name = (payload.name || "").trim();
    if (!name) {
      addError(errors, "name", "This field is required.");
    }
    const homeAddress = (payload.home_address || "").trim();
    if (!homeAddress) {
      addError(errors, "home_address", "This field is required.");
    }

    const email = payload.email || "";
    if (email && !String(email).includes("@")) {
      addError(errors, "email", "Enter a valid email address.");
    }

    const phone = payload.phone || "";
    const homeLat = toNumber(payload.home_lat);
    if (
      payload.home_lat !== null &&
      payload.home_lat !== undefined &&
      payload.home_lat !== "" &&
      homeLat === null
    ) {
      addError(errors, "home_lat", "Enter a valid latitude.");
    }
    const homeLng = toNumber(payload.home_lng);
    if (
      payload.home_lng !== null &&
      payload.home_lng !== undefined &&
      payload.home_lng !== "" &&
      homeLng === null
    ) {
      addError(errors, "home_lng", "Enter a valid longitude.");
    }

    const hourlyRate = toNumber(payload.hourly_rate);
    if (
      payload.hourly_rate !== null &&
      payload.hourly_rate !== undefined &&
      payload.hourly_rate !== "" &&
      hourlyRate === null
    ) {
      addError(errors, "hourly_rate", "Enter a valid number.");
    }
    const travelRateKm = toNumber(payload.travel_rate_km);
    if (
      payload.travel_rate_km !== null &&
      payload.travel_rate_km !== undefined &&
      payload.travel_rate_km !== "" &&
      travelRateKm === null
    ) {
      addError(errors, "travel_rate_km", "Enter a valid number.");
    }

    const trainingTypes = Array.isArray(payload.training_types) ? payload.training_types : [];
    const trainingTypeIds = trainingTypes
      .map((value) => toInt(value))
      .filter((value) => value !== null);

    const maxDistance = toNumber(payload.max_distance_km);
    if (
      payload.max_distance_km !== null &&
      payload.max_distance_km !== undefined &&
      payload.max_distance_km !== "" &&
      maxDistance === null
    ) {
      addError(errors, "max_distance_km", "Enter a valid number.");
    } else if (maxDistance !== null && maxDistance < 1) {
      addError(errors, "max_distance_km", "Ensure this value is greater than 0.");
    }

    const weekendAllowed =
      payload.weekend_allowed === undefined
        ? null
        : parseBoolean(payload.weekend_allowed);
    if (payload.weekend_allowed !== undefined && weekendAllowed === null) {
      addError(errors, "weekend_allowed", "Select a valid value.");
    }

    const maxLongTrips = toNumber(payload.max_long_trips_per_month);
    if (
      payload.max_long_trips_per_month !== null &&
      payload.max_long_trips_per_month !== undefined &&
      payload.max_long_trips_per_month !== "" &&
      maxLongTrips === null
    ) {
      addError(errors, "max_long_trips_per_month", "Enter a valid number.");
    } else if (maxLongTrips !== null && maxLongTrips < 0) {
      addError(errors, "max_long_trips_per_month", "Ensure this value is 0 or higher.");
    }

    const preferredWeekdays = Array.isArray(payload.preferred_weekdays)
      ? payload.preferred_weekdays
          .map((value) => toInt(value))
          .filter((value) => value !== null && value >= 0 && value <= 6)
      : [];

    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }

    if (trainingTypeIds.length) {
      const existingTypes = await prisma.trainingType.findMany({
        where: { id: { in: trainingTypeIds } },
        select: { id: true },
      });
      if (existingTypes.length !== trainingTypeIds.length) {
        addError(errors, "training_types", "Select a valid training type.");
      }
    }

    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }

    const trainer = await prisma.trainer.create({
      data: {
        name,
        email,
        phone,
        homeAddress,
        homeLat,
        homeLng,
        hourlyRate,
        travelRateKm,
        notes: payload.notes || "",
      },
    });

    const ruleData = [
      buildRuleData(trainer.id, "max_distance_km", maxDistance),
      buildRuleData(trainer.id, "weekend_allowed", weekendAllowed),
      buildRuleData(trainer.id, "max_long_trips_per_month", maxLongTrips),
      buildRuleData(trainer.id, "preferred_weekdays", preferredWeekdays),
    ].filter(Boolean);

    await syncTrainerRelations(trainer.id, trainingTypeIds, ruleData);

    const trainerFull = await prisma.trainer.findUnique({
      where: { id: trainer.id },
      include: trainerIncludes,
    });

    let updatedTrainer = trainerFull;
    if (updatedTrainer.homeLat === null || updatedTrainer.homeLng === null) {
      const geo = await geocodeAddress(updatedTrainer.homeAddress);
      if (geo) {
        updatedTrainer = await prisma.trainer.update({
          where: { id: updatedTrainer.id },
          data: { homeLat: geo.lat, homeLng: geo.lng },
          include: trainerIncludes,
        });
      }
    }

    return res.status(201).json({ item: trainerPayload(updatedTrainer, true) });
  })
);

api.get(
  "/trainers/:id/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (!id) {
      return res.status(404).json({ error: "Trainer not found." });
    }

    const trainer = await prisma.trainer.findUnique({
      where: { id },
      include: trainerIncludes,
    });
    if (!trainer) {
      return res.status(404).json({ error: "Trainer not found." });
    }

    const [assignedTrainings, monthTrainings] = await Promise.all([
      prisma.training.findMany({
        where: { assignedTrainerId: trainer.id },
        include: trainingIncludes,
        orderBy: { startDatetime: "desc" },
      }),
      prisma.training.findMany({
        where: {
          assignedTrainerId: trainer.id,
          status: { not: "canceled" },
        },
        select: {
          startDatetime: true,
          lat: true,
          lng: true,
        },
      }),
    ]);

    const now = new Date();
    const currentMonthTrainings = monthTrainings.filter(
      (item) =>
        item.startDatetime.getFullYear() === now.getFullYear() &&
        item.startDatetime.getMonth() === now.getMonth()
    );

    let monthLongTrips = 0;
    if (trainer.homeLat !== null && trainer.homeLng !== null) {
      for (const item of currentMonthTrainings) {
        if (item.lat === null || item.lng === null) {
          continue;
        }
        const distance = haversineKm(item.lat, item.lng, trainer.homeLat, trainer.homeLng);
        if (distance > LONG_TRIP_THRESHOLD_KM) {
          monthLongTrips += 1;
        }
      }
    }

    return res.json({
      item: trainerPayload(trainer, true),
      assigned_trainings: assignedTrainings.map(trainingListItem),
      month_workload: currentMonthTrainings.length,
      month_long_trips: monthLongTrips,
    });
  })
);

api.put(
  "/trainers/:id/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (!id) {
      return res.status(404).json({ error: "Trainer not found." });
    }

    const existing = await prisma.trainer.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Trainer not found." });
    }

    const payload = req.body || {};
    const errors = {};

    const name = (payload.name || "").trim();
    if (!name) {
      addError(errors, "name", "This field is required.");
    }
    const homeAddress = (payload.home_address || "").trim();
    if (!homeAddress) {
      addError(errors, "home_address", "This field is required.");
    }

    const email = payload.email || "";
    if (email && !String(email).includes("@")) {
      addError(errors, "email", "Enter a valid email address.");
    }

    const phone = payload.phone || "";
    const homeLat = toNumber(payload.home_lat);
    if (
      payload.home_lat !== null &&
      payload.home_lat !== undefined &&
      payload.home_lat !== "" &&
      homeLat === null
    ) {
      addError(errors, "home_lat", "Enter a valid latitude.");
    }
    const homeLng = toNumber(payload.home_lng);
    if (
      payload.home_lng !== null &&
      payload.home_lng !== undefined &&
      payload.home_lng !== "" &&
      homeLng === null
    ) {
      addError(errors, "home_lng", "Enter a valid longitude.");
    }

    const hourlyRate = toNumber(payload.hourly_rate);
    if (
      payload.hourly_rate !== null &&
      payload.hourly_rate !== undefined &&
      payload.hourly_rate !== "" &&
      hourlyRate === null
    ) {
      addError(errors, "hourly_rate", "Enter a valid number.");
    }
    const travelRateKm = toNumber(payload.travel_rate_km);
    if (
      payload.travel_rate_km !== null &&
      payload.travel_rate_km !== undefined &&
      payload.travel_rate_km !== "" &&
      travelRateKm === null
    ) {
      addError(errors, "travel_rate_km", "Enter a valid number.");
    }

    const trainingTypes = Array.isArray(payload.training_types) ? payload.training_types : [];
    const trainingTypeIds = trainingTypes
      .map((value) => toInt(value))
      .filter((value) => value !== null);

    const maxDistance = toNumber(payload.max_distance_km);
    if (
      payload.max_distance_km !== null &&
      payload.max_distance_km !== undefined &&
      payload.max_distance_km !== "" &&
      maxDistance === null
    ) {
      addError(errors, "max_distance_km", "Enter a valid number.");
    } else if (maxDistance !== null && maxDistance < 1) {
      addError(errors, "max_distance_km", "Ensure this value is greater than 0.");
    }

    const weekendAllowed =
      payload.weekend_allowed === undefined
        ? null
        : parseBoolean(payload.weekend_allowed);
    if (payload.weekend_allowed !== undefined && weekendAllowed === null) {
      addError(errors, "weekend_allowed", "Select a valid value.");
    }

    const maxLongTrips = toNumber(payload.max_long_trips_per_month);
    if (
      payload.max_long_trips_per_month !== null &&
      payload.max_long_trips_per_month !== undefined &&
      payload.max_long_trips_per_month !== "" &&
      maxLongTrips === null
    ) {
      addError(errors, "max_long_trips_per_month", "Enter a valid number.");
    } else if (maxLongTrips !== null && maxLongTrips < 0) {
      addError(errors, "max_long_trips_per_month", "Ensure this value is 0 or higher.");
    }

    const preferredWeekdays = Array.isArray(payload.preferred_weekdays)
      ? payload.preferred_weekdays
          .map((value) => toInt(value))
          .filter((value) => value !== null && value >= 0 && value <= 6)
      : [];

    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }

    if (trainingTypeIds.length) {
      const existingTypes = await prisma.trainingType.findMany({
        where: { id: { in: trainingTypeIds } },
        select: { id: true },
      });
      if (existingTypes.length !== trainingTypeIds.length) {
        addError(errors, "training_types", "Select a valid training type.");
      }
    }

    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }

    await prisma.trainer.update({
      where: { id },
      data: {
        name,
        email,
        phone,
        homeAddress,
        homeLat,
        homeLng,
        hourlyRate,
        travelRateKm,
        notes: payload.notes || "",
      },
    });

    const ruleData = [
      buildRuleData(id, "max_distance_km", maxDistance),
      buildRuleData(id, "weekend_allowed", weekendAllowed),
      buildRuleData(id, "max_long_trips_per_month", maxLongTrips),
      buildRuleData(id, "preferred_weekdays", preferredWeekdays),
    ].filter(Boolean);

    await syncTrainerRelations(id, trainingTypeIds, ruleData);

    const trainerFull = await prisma.trainer.findUnique({
      where: { id },
      include: trainerIncludes,
    });

    let updatedTrainer = trainerFull;
    if (updatedTrainer.homeLat === null || updatedTrainer.homeLng === null) {
      const geo = await geocodeAddress(updatedTrainer.homeAddress);
      if (geo) {
        updatedTrainer = await prisma.trainer.update({
          where: { id: updatedTrainer.id },
          data: { homeLat: geo.lat, homeLng: geo.lng },
          include: trainerIncludes,
        });
      }
    }

    return res.json({ item: trainerPayload(updatedTrainer, true) });
  })
);

api.get(
  "/training-types/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const types = await prisma.trainingType.findMany({ orderBy: { name: "asc" } });
    res.json({ items: types.map(trainingTypePayload) });
  })
);

api.post(
  "/training-types/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const errors = {};
    const name = (payload.name || "").trim();
    if (!name) {
      addError(errors, "name", "This field is required.");
    }

    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }

    const existing = await prisma.trainingType.findUnique({ where: { name } });
    if (existing) {
      return res.status(400).json({ errors: { name: [{ message: "Name must be unique." }] } });
    }

    const trainingType = await prisma.trainingType.create({ data: { name } });
    return res.status(201).json({ item: trainingTypePayload(trainingType) });
  })
);

api.get(
  "/calendar/month/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const today = new Date();
    const year = toInt(req.query.year) || today.getFullYear();
    const month = toInt(req.query.month) || today.getMonth() + 1;
    const safeMonth = month >= 1 && month <= 12 ? month : today.getMonth() + 1;

    const monthStart = new Date(year, safeMonth - 1, 1);
    const monthEnd = new Date(year, safeMonth, 0, 23, 59, 59, 999);

    const trainings = await prisma.training.findMany({
      where: {
        startDatetime: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      include: trainingIncludes,
      orderBy: { startDatetime: "asc" },
    });

    const trainingsByDay = {};
    for (const training of trainings) {
      const key = formatDate(training.startDatetime);
      if (!trainingsByDay[key]) {
        trainingsByDay[key] = [];
      }
      trainingsByDay[key].push(training);
    }

    const start = startOfWeekMonday(monthStart);
    const end = startOfWeekMonday(monthEnd);
    end.setDate(end.getDate() + 6);

    const monthDays = [];
    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      monthDays.push(new Date(cursor));
    }

    const weeks = [];
    for (let i = 0; i < monthDays.length; i += 7) {
      const week = [];
      for (const day of monthDays.slice(i, i + 7)) {
        const key = formatDate(day);
        week.push({
          date: key,
          in_month: day.getMonth() + 1 === safeMonth,
          trainings: (trainingsByDay[key] || []).map((item) => ({
            id: item.id,
            label: item.trainingType.name,
            customer_name: item.customerName || "",
            status: item.status,
            status_label: statusChoices().find((choice) => choice.value === item.status)?.label,
            start_time: formatTime(item.startDatetime, config.timeZone),
            address: item.address,
          })),
        });
      }
      weeks.push(week);
    }

    let prevMonth = safeMonth - 1;
    let prevYear = year;
    let nextMonth = safeMonth + 1;
    let nextYear = year;
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear -= 1;
    }
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }

    const monthName = new Intl.DateTimeFormat("en-US", {
      month: "long",
      timeZone: config.timeZone,
    }).format(new Date(year, safeMonth - 1, 1));

    return res.json({
      month: safeMonth,
      year,
      month_name: monthName,
      weeks,
      prev_month: prevMonth,
      prev_year: prevYear,
      next_month: nextMonth,
      next_year: nextYear,
      today: formatDate(today),
    });
  })
);

api.get(
  "/calendar/week/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const today = new Date();
    const selected = parseDateOnly(req.query.date) || today;
    const weekStart = startOfWeekMonday(selected);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const trainings = await prisma.training.findMany({
      where: {
        startDatetime: {
          gte: startOfDay(weekStart),
          lte: endOfDay(weekEnd),
        },
      },
      include: trainingIncludes,
      orderBy: { startDatetime: "asc" },
    });

    const trainingsByDay = {};
    for (const training of trainings) {
      const key = formatDate(training.startDatetime);
      if (!trainingsByDay[key]) {
        trainingsByDay[key] = [];
      }
      trainingsByDay[key].push(training);
    }

    const days = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + offset);
      const weekday = new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        timeZone: config.timeZone,
      }).format(day);
      const label = `${weekday} ${String(day.getDate()).padStart(2, "0")}`;
      const key = formatDate(day);
      days.push({
        date: key,
        label,
        trainings: (trainingsByDay[key] || []).map((item) => ({
          id: item.id,
          label: item.trainingType.name,
          customer_name: item.customerName || "",
          status: item.status,
          status_label: statusChoices().find((choice) => choice.value === item.status)?.label,
          start_time: formatTime(item.startDatetime, config.timeZone),
          address: item.address,
        })),
      });
    }

    const prevDate = new Date(weekStart);
    prevDate.setDate(prevDate.getDate() - 7);
    const nextDate = new Date(weekStart);
    nextDate.setDate(nextDate.getDate() + 7);

    return res.json({
      week_start: formatDate(weekStart),
      days,
      prev_date: formatDate(prevDate),
      next_date: formatDate(nextDate),
    });
  })
);

app.use("/api", api);

if (process.env.NODE_ENV === "production") {
  const staticDir = path.resolve(__dirname, "..", "public");
  app.use(express.static(staticDir));
  app.get("*", (req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON payload." });
  }
  console.error(err);
  return res.status(500).json({ error: "Internal server error." });
});

const server = app.listen(config.port, () => {
  console.log(`Backend listening on http://127.0.0.1:${config.port}`);
});

const shutdown = async () => {
  await prisma.$disconnect();
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
