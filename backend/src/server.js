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
app.use(express.json({ limit: "5mb" }));
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

const normalizeHeader = (value) => {
  if (!value) {
    return "";
  }
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
};

const HEADER_ALIASES = {
  monday: ["monday", "po", "pondeli", "pondělí"],
  tuesday: ["tuesday", "tu", "utery", "úterý"],
  wednesday: ["wednesday", "we", "streda", "středa"],
  thursday: ["thursday", "th", "ctvrtek", "čtvrtek"],
  friday: ["friday", "fr", "patek", "pátek"],
  saturday: ["saturday", "sa", "sobota"],
  sunday: ["sunday", "su", "nedele", "neděle"],
  first_name: ["first_name", "firstname", "first name", "jmeno", "jméno"],
  last_name: ["last_name", "lastname", "last name", "prijmeni", "příjmení"],
  title_prefix: [
    "title_prefix",
    "title prefix",
    "titul_pred_jmenem",
    "titul před jménem",
    "prefix",
  ],
  title_suffix: [
    "title_suffix",
    "title suffix",
    "titul_za_jmenem",
    "titul za jménem",
    "suffix",
  ],
  frequency_quantity: ["frequency_quantity", "frequency quantity", "frekvence_hodnota"],
  frequency_period: ["frequency_period", "frequency period", "frekvence_jednotka"],
  distance_limit: ["distance_limit", "distance limit", "limit_vzdalenosti"],
  limit_note: ["limit_note", "limit note", "poznamka_k_limitu", "poznámka k limitu"],
  akris: ["akris"],
  call_before_training: [
    "call_before_training",
    "call before training",
    "zavolat_pred_treninkem",
    "zavolat před tréninkem",
  ],
  email: ["email", "e-mail", "mail"],
  phone: ["phone", "telefon", "tel"],
  home_address: [
    "home_address",
    "home address",
    "home",
    "address",
    "adresa",
    "adresa_bydliste",
    "bydliste",
    "bydliště",
  ],
  home_lat: ["home_lat", "home latitude", "latitude", "sirka", "šířka", "zemepisna_sirka"],
  home_lng: ["home_lng", "home longitude", "longitude", "delka", "délka", "zemepisna_delka"],
  hourly_rate: [
    "hourly_rate",
    "hourly rate",
    "hodinova_sazba",
    "hodinová_sazba",
    "hodinova_sazba_kc",
  ],
  travel_rate_km: [
    "travel_rate_km",
    "travel rate",
    "travel_rate",
    "cestovne",
    "cestovné",
    "cestovne_kc_km",
  ],
  notes: ["notes", "note", "poznamka", "poznámka", "poznamky", "poznámky"],
};

const HEADER_LOOKUP = Object.entries(HEADER_ALIASES).reduce((acc, [key, aliases]) => {
  aliases.forEach((alias) => {
    acc[normalizeHeader(alias)] = key;
  });
  return acc;
}, {});

const buildHeaderIndex = (headers) => {
  const index = {};
  headers.forEach((header, idx) => {
    const normalized = normalizeHeader(header);
    const key = HEADER_LOOKUP[normalized];
    if (key && index[key] === undefined) {
      index[key] = idx;
    }
  });
  return index;
};

const detectDelimiter = (line) => {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && counts[char] !== undefined) {
      counts[char] += 1;
    }
  }
  if (counts[";"] >= counts[","] && counts[";"] >= counts["\t"] && counts[";"] > 0) {
    return ";";
  }
  if (counts["\t"] > counts[","]) {
    return "\t";
  }
  return ",";
};

const parseCsv = (input, delimiter) => {
  const rows = [];
  let row = [];
  let current = "";
  let inQuotes = false;
  const text = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === "\"") {
        if (text[i + 1] === "\"") {
          current += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }
    if (char === delimiter) {
      row.push(current);
      current = "";
      continue;
    }
    if (char === "\n") {
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }
    current += char;
  }

  if (current.length || row.length) {
    row.push(current);
    rows.push(row);
  }

  return rows;
};

const parseCsvBoolean = (value, fallback) => {
  if (value === null || value === undefined || String(value).trim() === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["ano", "a", "true", "1", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["ne", "n", "false", "0", "no"].includes(normalized)) {
    return false;
  }
  return null;
};

const parseCsvNumber = (value) => {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const normalized = String(value).trim().replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return parsed;
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
      prisma.trainer.findMany({
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      }),
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
    const trainers = await prisma.trainer.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    res.json({ items: trainers.map((trainer) => trainerPayload(trainer, false)) });
  })
);

api.post(
  "/trainers/import/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const csv = payload.csv;
    if (!csv || typeof csv !== "string") {
      return res.status(400).json({ error: "CSV obsah je povinný." });
    }

    const text = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;
    const firstLine = text.split(/\r?\n/, 1)[0] || "";
    const delimiter = detectDelimiter(firstLine);
    const rows = parseCsv(text, delimiter);
    if (!rows.length) {
      return res.status(400).json({ error: "CSV soubor je prázdný." });
    }

    const headers = rows[0].map((header) => String(header || "").trim());
    const headerIndex = buildHeaderIndex(headers);
    const requiredHeaders = ["first_name", "last_name", "home_address"];
    const missingHeaders = requiredHeaders.filter((key) => headerIndex[key] === undefined);
    if (missingHeaders.length) {
      return res.status(400).json({
        error: `Chybí povinné sloupce: ${missingHeaders.join(", ")}.`,
      });
    }

    const dryRun = payload.dry_run === true;
    const errors = [];
    let imported = 0;
    let skipped = 0;

    const getValue = (row, key) => {
      const idx = headerIndex[key];
      if (idx === undefined) {
        return "";
      }
      return row[idx] ?? "";
    };

    const weekdayColumns = [
      { key: "monday", value: 0 },
      { key: "tuesday", value: 1 },
      { key: "wednesday", value: 2 },
      { key: "thursday", value: 3 },
      { key: "friday", value: 4 },
      { key: "saturday", value: 5 },
      { key: "sunday", value: 6 },
    ];

    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      const rowNumber = i + 1;
      if (!row || row.every((cell) => !String(cell || "").trim())) {
        continue;
      }

      const rowErrors = [];
      const firstName = String(getValue(row, "first_name")).trim();
      if (!firstName) {
        rowErrors.push({ field: "first_name", message: "Jméno je povinné." });
      }
      const lastName = String(getValue(row, "last_name")).trim();
      if (!lastName) {
        rowErrors.push({ field: "last_name", message: "Příjmení je povinné." });
      }
      const homeAddress = String(getValue(row, "home_address")).trim();
      if (!homeAddress) {
        rowErrors.push({ field: "home_address", message: "Adresa je povinná." });
      }

      const titlePrefix = String(getValue(row, "title_prefix") || "").trim();
      const titleSuffix = String(getValue(row, "title_suffix") || "").trim();
      const email = String(getValue(row, "email") || "").trim();
      if (email && !email.includes("@")) {
        rowErrors.push({ field: "email", message: "Neplatný e-mail." });
      }
      const phone = String(getValue(row, "phone") || "").trim();

      const akris = parseCsvBoolean(getValue(row, "akris"), false);
      if (akris === null) {
        rowErrors.push({ field: "akris", message: "AKRIS musí být Ano/Ne." });
      }
      const callBeforeTraining = parseCsvBoolean(getValue(row, "call_before_training"), false);
      if (callBeforeTraining === null) {
        rowErrors.push({
          field: "call_before_training",
          message: "Zavolat před tréninkem musí být Ano/Ne.",
        });
      }

      const frequencyQuantity = String(getValue(row, "frequency_quantity") || "").trim();
      const frequencyPeriod = String(getValue(row, "frequency_period") || "").trim();

      const maxDistance = parseCsvNumber(getValue(row, "distance_limit"));
      if (getValue(row, "distance_limit") && maxDistance === null) {
        rowErrors.push({ field: "distance_limit", message: "Neplatný limit vzdálenosti." });
      } else if (maxDistance !== null && maxDistance < 1) {
        rowErrors.push({ field: "distance_limit", message: "Limit vzdálenosti musí být > 0." });
      }

      const preferredWeekdays = [];
      for (const day of weekdayColumns) {
        const raw = getValue(row, day.key);
        const parsed = parseCsvBoolean(raw, false);
        if (raw && parsed === null) {
          rowErrors.push({
            field: day.key,
            message: "Neplatná hodnota pro den v týdnu (použijte Ano/Ne nebo 1/0).",
          });
        } else if (parsed) {
          preferredWeekdays.push(day.value);
        }
      }

      const homeLat = parseCsvNumber(getValue(row, "home_lat"));
      if (getValue(row, "home_lat") && homeLat === null) {
        rowErrors.push({ field: "home_lat", message: "Neplatná zeměpisná šířka." });
      }
      const homeLng = parseCsvNumber(getValue(row, "home_lng"));
      if (getValue(row, "home_lng") && homeLng === null) {
        rowErrors.push({ field: "home_lng", message: "Neplatná zeměpisná délka." });
      }

      const hourlyRate = parseCsvNumber(getValue(row, "hourly_rate"));
      if (getValue(row, "hourly_rate") && hourlyRate === null) {
        rowErrors.push({ field: "hourly_rate", message: "Neplatná hodinová sazba." });
      }
      const travelRateKm = parseCsvNumber(getValue(row, "travel_rate_km"));
      if (getValue(row, "travel_rate_km") && travelRateKm === null) {
        rowErrors.push({ field: "travel_rate_km", message: "Neplatné cestovné." });
      }

      const limitNote = String(getValue(row, "limit_note") || "").trim();
      const notes = String(getValue(row, "notes") || "").trim();

      if (rowErrors.length) {
        errors.push({ row: rowNumber, errors: rowErrors });
        skipped += 1;
        continue;
      }

      if (!dryRun) {
        let trainer = await prisma.trainer.create({
          data: {
            firstName,
            lastName,
            titlePrefix,
            titleSuffix,
            akris,
            callBeforeTraining,
            frequencyQuantity: frequencyQuantity || null,
            frequencyPeriod: frequencyPeriod || null,
            limitNote: limitNote || null,
            email,
            phone,
            homeAddress,
            homeLat,
            homeLng,
            hourlyRate,
            travelRateKm,
            notes,
          },
        });

        const ruleData = [
          buildRuleData(trainer.id, "max_distance_km", maxDistance),
          buildRuleData(trainer.id, "preferred_weekdays", preferredWeekdays),
        ].filter(Boolean);

        if (ruleData.length) {
          await syncTrainerRelations(trainer.id, [], ruleData);
        }

        if (trainer.homeLat === null || trainer.homeLng === null) {
          const geo = await geocodeAddress(trainer.homeAddress);
          if (geo) {
            trainer = await prisma.trainer.update({
              where: { id: trainer.id },
              data: { homeLat: geo.lat, homeLng: geo.lng },
            });
          }
        }
      }

      imported += 1;
    }

    return res.json({
      dry_run: dryRun,
      summary: {
        total_rows: rows.length - 1,
        imported,
        skipped,
        errors: errors.length,
      },
      errors,
    });
  })
);

api.post(
  "/trainers/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const errors = {};

    const firstName = (payload.first_name || "").trim();
    if (!firstName) {
      addError(errors, "first_name", "This field is required.");
    }
    const lastName = (payload.last_name || "").trim();
    if (!lastName) {
      addError(errors, "last_name", "This field is required.");
    }
    const titlePrefix = (payload.title_prefix || "").trim();
    const titleSuffix = (payload.title_suffix || "").trim();
    const akris = parseBoolean(payload.akris);
    if (akris === null) {
      addError(errors, "akris", "Select a valid value.");
    }
    const callBeforeTraining = parseBoolean(payload.call_before_training);
    if (callBeforeTraining === null) {
      addError(errors, "call_before_training", "Select a valid value.");
    }
    const frequencyQuantity = (payload.frequency_quantity || "").trim() || null;
    const frequencyPeriod = (payload.frequency_period || "").trim() || null;
    const limitNote = (payload.limit_note || "").trim() || null;
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
        firstName,
        lastName,
        titlePrefix,
        titleSuffix,
        akris,
        callBeforeTraining,
        frequencyQuantity,
        frequencyPeriod,
        limitNote,
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

    const firstName = (payload.first_name || "").trim();
    if (!firstName) {
      addError(errors, "first_name", "This field is required.");
    }
    const lastName = (payload.last_name || "").trim();
    if (!lastName) {
      addError(errors, "last_name", "This field is required.");
    }
    const titlePrefix = (payload.title_prefix || "").trim();
    const titleSuffix = (payload.title_suffix || "").trim();
    const akris = parseBoolean(payload.akris);
    if (akris === null) {
      addError(errors, "akris", "Select a valid value.");
    }
    const callBeforeTraining = parseBoolean(payload.call_before_training);
    if (callBeforeTraining === null) {
      addError(errors, "call_before_training", "Select a valid value.");
    }
    const frequencyQuantity = (payload.frequency_quantity || "").trim() || null;
    const frequencyPeriod = (payload.frequency_period || "").trim() || null;
    const limitNote = (payload.limit_note || "").trim() || null;
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
        firstName,
        lastName,
        titlePrefix,
        titleSuffix,
        akris,
        callBeforeTraining,
        frequencyQuantity,
        frequencyPeriod,
        limitNote,
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

    const monthName = new Intl.DateTimeFormat("cs-CZ", {
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
      const weekday = new Intl.DateTimeFormat("cs-CZ", {
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
