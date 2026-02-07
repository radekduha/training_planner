const crypto = require("crypto");
const path = require("path");
const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");

const config = require("./env");
const { prisma } = require("./db");
const { geocodeAddress } = require("./geocoding");
const {
  durationMinutesForType,
  monthRangeForDate,
  recommendTrainerSlots,
} = require("./matching");
const {
  fairnessPayload,
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

const VALID_STATUSES = new Set(["draft", "open", "assigned", "confirmed", "canceled"]);
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map();

const isStrongSessionSecret = (value) =>
  typeof value === "string" && value !== "change-me" && value.length >= 24;

if (process.env.NODE_ENV === "production" && !isStrongSessionSecret(config.sessionSecret)) {
  throw new Error("SESSION_SECRET must be set to a strong value in production.");
}

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

if (!isStrongSessionSecret(config.sessionSecret)) {
  console.warn("SESSION_SECRET is weak. Set a strong value for production.");
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

const requireAuthSse = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).end();
};

const normalizeStatus = (value, fallback = "open") => {
  const next = (value || "").trim().toLowerCase();
  if (!next) {
    return fallback;
  }
  if (next === "waiting") {
    return "open";
  }
  return next;
};

const clampPageLimit = (value) => {
  const parsed = toInt(value);
  if (!parsed || parsed < 1) {
    return DEFAULT_PAGE_LIMIT;
  }
  return Math.min(parsed, MAX_PAGE_LIMIT);
};

const encodeCursor = (id) => Buffer.from(String(id), "utf8").toString("base64url");

const decodeCursor = (cursor) => {
  if (!cursor) {
    return null;
  }
  try {
    const decoded = Buffer.from(String(cursor), "base64url").toString("utf8");
    return toInt(decoded);
  } catch (err) {
    return null;
  }
};

const ensureNotStale = (existingUpdatedAt, payloadUpdatedAt) => {
  const parsed = parseDateTime(payloadUpdatedAt);
  if (!parsed || !(existingUpdatedAt instanceof Date)) {
    return false;
  }
  return parsed.getTime() === existingUpdatedAt.getTime();
};

const loginAttemptKey = (req, username) => `${req.ip || "unknown"}:${username || "*"}`;

const getLoginAttemptState = (key) => {
  const now = Date.now();
  const state = loginAttempts.get(key);
  if (!state) {
    return { failures: [], lockedUntil: 0 };
  }
  if (state.lockedUntil && state.lockedUntil <= now) {
    loginAttempts.delete(key);
    return { failures: [], lockedUntil: 0 };
  }
  const failures = (state.failures || []).filter((timestamp) => now - timestamp <= LOGIN_WINDOW_MS);
  const next = { failures, lockedUntil: state.lockedUntil || 0 };
  loginAttempts.set(key, next);
  return next;
};

const failLoginAttempt = (key) => {
  const now = Date.now();
  const state = getLoginAttemptState(key);
  const failures = [...state.failures, now].filter((timestamp) => now - timestamp <= LOGIN_WINDOW_MS);
  const shouldLock = failures.length >= LOGIN_MAX_ATTEMPTS;
  const next = {
    failures,
    lockedUntil: shouldLock ? now + LOGIN_LOCK_MS : 0,
  };
  loginAttempts.set(key, next);
  return next;
};

const clearLoginAttempts = (req, username) => {
  loginAttempts.delete(loginAttemptKey(req, username));
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

const parseWindowRange = (payload = {}, errors = {}) => {
  const now = new Date();
  const defaultStart = startOfDay(now);
  const defaultEnd = endOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30));

  const rawStart =
    payload.request_window_start ?? payload.window_start ?? payload.start_datetime ?? null;
  const rawEnd = payload.request_window_end ?? payload.window_end ?? payload.end_datetime ?? null;

  let windowStart = rawStart ? parseDateTime(rawStart) : null;
  let windowEnd = rawEnd ? parseDateTime(rawEnd) : null;

  if (rawStart && !windowStart) {
    addError(errors, "request_window_start", "Enter a valid window start.");
  }
  if (rawEnd && !windowEnd) {
    addError(errors, "request_window_end", "Enter a valid window end.");
  }

  if (!rawStart && !rawEnd) {
    windowStart = defaultStart;
    windowEnd = defaultEnd;
  } else if (windowStart && !windowEnd) {
    windowEnd = endOfDay(
      new Date(windowStart.getFullYear(), windowStart.getMonth(), windowStart.getDate() + 30)
    );
  } else if (!windowStart && windowEnd) {
    windowStart = startOfDay(
      new Date(windowEnd.getFullYear(), windowEnd.getMonth(), windowEnd.getDate() - 30)
    );
  }

  if (windowStart && windowEnd && windowEnd <= windowStart) {
    addError(errors, "request_window_end", "Window end must be after window start.");
  }

  return { windowStart, windowEnd };
};

const fallbackAssignmentTime = (windowStart, trainingType) => {
  const start = windowStart || new Date();
  const end = new Date(start.getTime() + durationMinutesForType(trainingType) * 60000);
  return { start, end };
};

const listIncludes = {
  trainingType: true,
  assignedTrainer: true,
};

const trainerIncludes = {
  skills: { include: { trainingType: true } },
  availabilitySlots: {
    orderBy: { startDatetime: "asc" },
  },
};

const sseClients = new Set();

const broadcastEvent = (event, payload) => {
  const body = JSON.stringify(payload || {});
  sseClients.forEach((client) => {
    try {
      client.write(`event: ${event}\n`);
      client.write(`data: ${body}\n\n`);
    } catch (err) {
      sseClients.delete(client);
    }
  });
};

setInterval(() => {
  sseClients.forEach((client) => {
    try {
      client.write(`event: ping\ndata: {}\n\n`);
    } catch (err) {
      sseClients.delete(client);
    }
  });
}, 25000);

const offeredAndDeliveredByTrainer = async (trainerIds) => {
  if (!trainerIds.length) {
    return { offeredDatesByTrainer: {}, deliveredDatesByTrainer: {} };
  }

  const [slots, delivered] = await Promise.all([
    prisma.trainerAvailabilitySlot.findMany({
      where: {
        trainerId: { in: trainerIds },
        isActive: true,
      },
      select: {
        trainerId: true,
        startDatetime: true,
      },
    }),
    prisma.training.findMany({
      where: {
        assignedTrainerId: { in: trainerIds },
        status: { in: ["assigned", "confirmed"] },
      },
      select: {
        assignedTrainerId: true,
        startDatetime: true,
      },
    }),
  ]);

  const offeredDatesByTrainer = {};
  slots.forEach((slot) => {
    if (!offeredDatesByTrainer[slot.trainerId]) {
      offeredDatesByTrainer[slot.trainerId] = [];
    }
    offeredDatesByTrainer[slot.trainerId].push(slot.startDatetime);
  });

  const deliveredDatesByTrainer = {};
  delivered.forEach((item) => {
    if (!item.assignedTrainerId) {
      return;
    }
    if (!deliveredDatesByTrainer[item.assignedTrainerId]) {
      deliveredDatesByTrainer[item.assignedTrainerId] = [];
    }
    deliveredDatesByTrainer[item.assignedTrainerId].push(item.startDatetime);
  });

  return { offeredDatesByTrainer, deliveredDatesByTrainer };
};

const recommendationsForTraining = async (training) => {
  const windowStart = training.requestWindowStart || training.startDatetime;
  const windowEnd = training.requestWindowEnd || training.endDatetime;

  if (!(windowStart instanceof Date) || !(windowEnd instanceof Date)) {
    return [];
  }

  const trainers = await prisma.trainer.findMany({
    where: {
      skills: {
        some: {
          trainingTypeId: training.trainingTypeId,
        },
      },
    },
    include: {
      skills: true,
    },
  });

  if (!trainers.length) {
    return [];
  }

  const trainerIds = trainers.map((trainer) => trainer.id);
  const [slots, maps] = await Promise.all([
    prisma.trainerAvailabilitySlot.findMany({
      where: {
        trainerId: { in: trainerIds },
        isActive: true,
        OR: [
          { assignedTrainingId: null },
          { assignedTrainingId: training.id },
        ],
        startDatetime: { gte: windowStart },
        endDatetime: { lte: windowEnd },
      },
      orderBy: [{ startDatetime: "asc" }],
    }),
    offeredAndDeliveredByTrainer(trainerIds),
  ]);

  const matches = recommendTrainerSlots({
    training,
    trainers,
    slots,
    deliveredDatesByTrainer: maps.deliveredDatesByTrainer,
  });

  return matches.map((match) => ({
    trainer: trainerSummary(match.trainer),
    slot: {
      id: match.slot.id,
      start_datetime: match.slot.startDatetime.toISOString(),
      end_datetime: match.slot.endDatetime.toISOString(),
    },
    match_percent: Number(match.matchPercent.toFixed(2)),
    reasons: match.reasons,
    fairness: fairnessPayload(match.fairness),
  }));
};

const ensureTrainerSkills = async (tx, trainerId, trainingTypeIds) => {
  await tx.trainerSkill.deleteMany({ where: { trainerId } });
  if (!trainingTypeIds.length) {
    return;
  }
  await tx.trainerSkill.createMany({
    data: trainingTypeIds.map((trainingTypeId) => ({ trainerId, trainingTypeId })),
  });
};

const normalizeSlotPayload = (slots, errors) => {
  if (!Array.isArray(slots)) {
    return [];
  }

  const normalized = [];
  slots.forEach((slot, idx) => {
    const start = parseDateTime(slot.start_datetime || slot.startDatetime);
    const end = parseDateTime(slot.end_datetime || slot.endDatetime);
    if (!start) {
      addError(errors, `availability_slots_${idx}_start`, "Enter a valid slot start.");
      return;
    }
    if (!end) {
      addError(errors, `availability_slots_${idx}_end`, "Enter a valid slot end.");
      return;
    }
    if (end <= start) {
      addError(errors, `availability_slots_${idx}_end`, "Slot end must be after start.");
      return;
    }
    const isActive =
      slot.is_active === undefined || slot.is_active === null
        ? true
        : Boolean(slot.is_active);
    normalized.push({ startDatetime: start, endDatetime: end, isActive });
  });

  return normalized;
};

const replaceTrainerAvailabilitySlots = async (tx, trainerId, slots) => {
  await tx.trainerAvailabilitySlot.deleteMany({
    where: {
      trainerId,
      assignedTrainingId: null,
    },
  });

  if (!slots.length) {
    return;
  }

  await tx.trainerAvailabilitySlot.createMany({
    data: slots.map((slot) => ({
      trainerId,
      startDatetime: slot.startDatetime,
      endDatetime: slot.endDatetime,
      isActive: slot.isActive,
    })),
  });
};

const fairnessForTrainerInMonth = async (trainerId, monthDate = new Date()) => {
  const month = monthRangeForDate(monthDate);

  const [trainerSlots, totalSlots, trainerDeliveries, totalDeliveries] = await Promise.all([
    prisma.trainerAvailabilitySlot.findMany({
      where: {
        trainerId,
        isActive: true,
        startDatetime: { gte: month.start, lte: month.end },
      },
      select: { startDatetime: true },
    }),
    prisma.trainerAvailabilitySlot.findMany({
      where: {
        isActive: true,
        startDatetime: { gte: month.start, lte: month.end },
      },
      select: { trainerId: true, startDatetime: true },
    }),
    prisma.training.findMany({
      where: {
        assignedTrainerId: trainerId,
        status: { in: ["assigned", "confirmed"] },
        startDatetime: { gte: month.start, lte: month.end },
      },
      select: { startDatetime: true },
    }),
    prisma.training.findMany({
      where: {
        assignedTrainerId: { not: null },
        status: { in: ["assigned", "confirmed"] },
        startDatetime: { gte: month.start, lte: month.end },
      },
      select: { assignedTrainerId: true, startDatetime: true },
    }),
  ]);

  const distinctDays = (items) =>
    new Set(items.map((item) => item.startDatetime.toISOString().slice(0, 10))).size;

  const offeredDays = distinctDays(trainerSlots);

  const offeredByTrainer = {};
  totalSlots.forEach((slot) => {
    if (!offeredByTrainer[slot.trainerId]) {
      offeredByTrainer[slot.trainerId] = new Set();
    }
    offeredByTrainer[slot.trainerId].add(slot.startDatetime.toISOString().slice(0, 10));
  });

  const deliveredDays = distinctDays(trainerDeliveries);

  const deliveredByTrainer = {};
  totalDeliveries.forEach((item) => {
    if (!item.assignedTrainerId) {
      return;
    }
    if (!deliveredByTrainer[item.assignedTrainerId]) {
      deliveredByTrainer[item.assignedTrainerId] = new Set();
    }
    deliveredByTrainer[item.assignedTrainerId].add(item.startDatetime.toISOString().slice(0, 10));
  });

  const totalOfferedDays = Object.values(offeredByTrainer).reduce(
    (sum, set) => sum + set.size,
    0
  );
  const totalDeliveredDays = Object.values(deliveredByTrainer).reduce(
    (sum, set) => sum + set.size,
    0
  );

  const targetShare = totalOfferedDays ? offeredDays / totalOfferedDays : 0;
  const actualShare = totalDeliveredDays ? deliveredDays / totalDeliveredDays : 0;
  const deviationRatio =
    targetShare > 0 ? Math.abs(actualShare - targetShare) / targetShare : actualShare > 0 ? 1 : 0;

  return {
    offeredDays,
    deliveredDays,
    targetShare,
    actualShare,
    deviationRatio,
    withinTolerance: deviationRatio <= 0.2,
  };
};

const releaseTrainingSlot = async (tx, training, trainingType, nextStatus, changedBy) => {
  await tx.trainerAvailabilitySlot.updateMany({
    where: { assignedTrainingId: training.id },
    data: { assignedTrainingId: null },
  });

  const fallback = fallbackAssignmentTime(training.requestWindowStart || training.startDatetime, trainingType);

  return tx.training.update({
    where: { id: training.id },
    data: {
      assignedTrainerId: null,
      status: nextStatus,
      startDatetime: fallback.start,
      endDatetime: fallback.end,
      changedBy,
    },
    include: listIncludes,
  });
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

    const key = loginAttemptKey(req, username);
    const state = getLoginAttemptState(key);
    if (state.lockedUntil && state.lockedUntil > Date.now()) {
      const retryAfterSeconds = Math.ceil((state.lockedUntil - Date.now()) / 1000);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        error: "Too many failed login attempts. Try again later.",
        retry_after_seconds: retryAfterSeconds,
      });
    }

    if (!username || !password) {
      failLoginAttempt(key);
      return res.status(400).json({ error: "Username and password are required." });
    }
    if (username !== config.adminUsername || password !== config.adminPassword) {
      const failed = failLoginAttempt(key);
      if (failed.lockedUntil && failed.lockedUntil > Date.now()) {
        const retryAfterSeconds = Math.ceil((failed.lockedUntil - Date.now()) / 1000);
        res.setHeader("Retry-After", String(retryAfterSeconds));
        return res.status(429).json({
          error: "Too many failed login attempts. Try again later.",
          retry_after_seconds: retryAfterSeconds,
        });
      }
      return res.status(400).json({ error: "Invalid credentials." });
    }
    clearLoginAttempts(req, username);
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
  "/events/",
  requireAuthSse,
  asyncHandler(async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    res.write("event: ready\n");
    res.write(`data: ${JSON.stringify({ ok: true })}\n\n`);

    sseClients.add(res);
    req.on("close", () => {
      sseClients.delete(res);
    });
  })
);

api.get(
  "/meta/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [trainingTypes, trainers] = await Promise.all([
      prisma.trainingType.findMany({ orderBy: { name: "asc" } }),
      prisma.trainer.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    ]);
    res.json({
      training_types: trainingTypes.map(trainingTypePayload),
      trainer_choices: trainers.map(trainerSummary),
      status_choices: statusChoices(),
      time_zone: config.timeZone,
    });
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

    const durationInput = payload.duration_minutes;
    const teachingHoursInput = payload.teaching_hours;

    const durationMinutes =
      durationInput === undefined || durationInput === null || durationInput === ""
        ? null
        : toInt(durationInput);
    const teachingHours =
      teachingHoursInput === undefined || teachingHoursInput === null || teachingHoursInput === ""
        ? null
        : toNumber(teachingHoursInput);

    if (durationInput !== undefined && durationInput !== "" && !durationMinutes) {
      addError(errors, "duration_minutes", "Enter a valid duration in minutes.");
    }
    if (durationMinutes !== null && durationMinutes < 30) {
      addError(errors, "duration_minutes", "Duration must be at least 30 minutes.");
    }

    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }

    const existing = await prisma.trainingType.findUnique({ where: { name } });
    if (existing) {
      addError(errors, "name", "Name must be unique.");
      return res.status(400).json({ errors });
    }

    const created = await prisma.trainingType.create({
      data: {
        name,
        durationMinutes: durationMinutes || 240,
        teachingHours: teachingHours ?? (durationMinutes ? durationMinutes / 60 : null),
      },
    });

    broadcastEvent("invalidate", { entity: "training_type", id: created.id });
    res.status(201).json({ item: trainingTypePayload(created) });
  })
);

api.get(
  "/training-types/:id/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (!id) {
      return res.status(404).json({ error: "Training type not found." });
    }

    const trainingType = await prisma.trainingType.findUnique({ where: { id } });
    if (!trainingType) {
      return res.status(404).json({ error: "Training type not found." });
    }

    const trainers = await prisma.trainer.findMany({
      where: {
        skills: { some: { trainingTypeId: id } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    res.json({
      item: trainingTypePayload(trainingType),
      trainers: trainers.map(trainerSummary),
    });
  })
);

api.put(
  "/training-types/:id/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (!id) {
      return res.status(404).json({ error: "Training type not found." });
    }

    const existingType = await prisma.trainingType.findUnique({ where: { id } });
    if (!existingType) {
      return res.status(404).json({ error: "Training type not found." });
    }

    const payload = req.body || {};
    const errors = {};
    const name = (payload.name || "").trim();
    if (!name) {
      addError(errors, "name", "This field is required.");
    }

    const durationMinutes =
      payload.duration_minutes === undefined || payload.duration_minutes === null || payload.duration_minutes === ""
        ? existingType.durationMinutes
        : toInt(payload.duration_minutes);

    if (payload.duration_minutes !== undefined && payload.duration_minutes !== "" && !durationMinutes) {
      addError(errors, "duration_minutes", "Enter a valid duration in minutes.");
    }
    if (durationMinutes !== null && durationMinutes < 30) {
      addError(errors, "duration_minutes", "Duration must be at least 30 minutes.");
    }

    const teachingHours =
      payload.teaching_hours === undefined || payload.teaching_hours === null || payload.teaching_hours === ""
        ? existingType.teachingHours
        : toNumber(payload.teaching_hours);
    const maxParticipants =
      payload.max_participants === undefined || payload.max_participants === null || payload.max_participants === ""
        ? existingType.maxParticipants
        : toInt(payload.max_participants);

    if (payload.teaching_hours !== undefined && payload.teaching_hours !== "" && teachingHours === null) {
      addError(errors, "teaching_hours", "Enter a valid number.");
    }
    if (payload.max_participants !== undefined && payload.max_participants !== "" && maxParticipants === null) {
      addError(errors, "max_participants", "Enter a valid number.");
    }

    const sameName = await prisma.trainingType.findUnique({ where: { name } });
    if (sameName && sameName.id !== id) {
      addError(errors, "name", "Name must be unique.");
    }

    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }

    const updated = await prisma.trainingType.update({
      where: { id },
      data: {
        name,
        durationMinutes,
        teachingHours,
        maxParticipants,
      },
    });

    broadcastEvent("invalidate", { entity: "training_type", id: updated.id });
    res.json({ item: trainingTypePayload(updated) });
  })
);

api.delete(
  "/training-types/:id/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (!id) {
      return res.status(404).json({ error: "Training type not found." });
    }

    const trainingType = await prisma.trainingType.findUnique({ where: { id } });
    if (!trainingType) {
      return res.status(404).json({ error: "Training type not found." });
    }

    const linkedTrainings = await prisma.training.count({ where: { trainingTypeId: id } });
    if (linkedTrainings > 0) {
      return res
        .status(400)
        .json({ error: "Training type is used by requests and cannot be deleted." });
    }

    await prisma.trainingType.delete({ where: { id } });
    broadcastEvent("invalidate", { entity: "training_type", id });
    res.json({ ok: true });
  })
);

api.get(
  "/trainers/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = clampPageLimit(req.query.limit);
    const cursorId = decodeCursor(req.query.cursor);
    if (req.query.cursor && !cursorId) {
      return res.status(400).json({ error: "Invalid cursor." });
    }

    const trainersPage = await prisma.trainer.findMany({
      where: cursorId ? { id: { lt: cursorId } } : undefined,
      orderBy: [{ id: "desc" }],
      take: limit + 1,
    });
    const totalCount = await prisma.trainer.count();

    if (!trainersPage.length) {
      return res.json({ items: [], next_cursor: null });
    }
    const hasMore = trainersPage.length > limit;
    const trainers = hasMore ? trainersPage.slice(0, limit) : trainersPage;

    const trainerIds = trainers.map((trainer) => trainer.id);
    const now = new Date();

    const [trainingCounts, upcomingTrainings] = await Promise.all([
      prisma.training.groupBy({
        by: ["assignedTrainerId"],
        where: {
          assignedTrainerId: { in: trainerIds },
          status: { in: ["assigned", "confirmed"] },
        },
        _count: { _all: true },
      }),
      prisma.training.findMany({
        where: {
          assignedTrainerId: { in: trainerIds },
          status: { in: ["assigned", "confirmed"] },
          startDatetime: { gte: now },
        },
        include: listIncludes,
        orderBy: { startDatetime: "asc" },
      }),
    ]);

    const countsByTrainer = trainingCounts.reduce((acc, item) => {
      if (item.assignedTrainerId) {
        acc[item.assignedTrainerId] = item._count._all;
      }
      return acc;
    }, {});

    const nextTrainingByTrainer = upcomingTrainings.reduce((acc, training) => {
      if (training.assignedTrainerId && !acc[training.assignedTrainerId]) {
        acc[training.assignedTrainerId] = training;
      }
      return acc;
    }, {});

    const items = trainers.map((trainer) => {
      const payload = trainerPayload(trainer, false);
      payload.assigned_trainings_count = countsByTrainer[trainer.id] || 0;
      payload.next_assigned_training = nextTrainingByTrainer[trainer.id]
        ? trainingListItem(nextTrainingByTrainer[trainer.id])
        : null;
      return payload;
    });

    const nextCursor =
      hasMore && trainers.length ? encodeCursor(trainers[trainers.length - 1].id) : null;
    res.json({ items, next_cursor: nextCursor, total_count: totalCount });
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

    const homeAddress = (payload.home_address || "").trim();
    if (!homeAddress) {
      addError(errors, "home_address", "This field is required.");
    }

    const email = (payload.email || "").trim();
    if (email && !email.includes("@")) {
      addError(errors, "email", "Enter a valid email address.");
    }

    const homeLat = toNumber(payload.home_lat);
    if (payload.home_lat !== undefined && payload.home_lat !== "" && homeLat === null) {
      addError(errors, "home_lat", "Enter a valid latitude.");
    }
    const homeLng = toNumber(payload.home_lng);
    if (payload.home_lng !== undefined && payload.home_lng !== "" && homeLng === null) {
      addError(errors, "home_lng", "Enter a valid longitude.");
    }

    const trainingTypeIds = Array.isArray(payload.training_types)
      ? payload.training_types.map((value) => toInt(value)).filter(Boolean)
      : [];

    const slots = normalizeSlotPayload(payload.availability_slots, errors);

    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }

    const created = await prisma.$transaction(async (tx) => {
      const trainer = await tx.trainer.create({
        data: {
          firstName,
          lastName,
          titlePrefix: (payload.title_prefix || "").trim() || null,
          titleSuffix: (payload.title_suffix || "").trim() || null,
          email: email || null,
          phone: (payload.phone || "").trim() || null,
          homeAddress,
          homeLat,
          homeLng,
          notes: (payload.notes || "").trim() || null,
          akris: parseBoolean(payload.akris) ?? false,
          callBeforeTraining: parseBoolean(payload.call_before_training) ?? false,
          frequencyQuantity: (payload.frequency_quantity || "").trim() || null,
          frequencyPeriod: (payload.frequency_period || "").trim() || null,
          limitNote: (payload.limit_note || "").trim() || null,
          hourlyRate: toNumber(payload.hourly_rate),
          travelRateKm: toNumber(payload.travel_rate_km),
        },
      });

      if (trainingTypeIds.length) {
        await ensureTrainerSkills(tx, trainer.id, Array.from(new Set(trainingTypeIds)));
      }

      await replaceTrainerAvailabilitySlots(tx, trainer.id, slots);

      return tx.trainer.findUnique({
        where: { id: trainer.id },
        include: trainerIncludes,
      });
    });

    let resolved = created;
    if ((created.homeLat === null || created.homeLng === null) && created.homeAddress) {
      const geo = await geocodeAddress(created.homeAddress);
      if (geo) {
        resolved = await prisma.trainer.update({
          where: { id: created.id },
          data: { homeLat: geo.lat, homeLng: geo.lng },
          include: trainerIncludes,
        });
      }
    }

    broadcastEvent("invalidate", { entity: "trainer", id: resolved.id });
    res.status(201).json({ item: trainerPayload(resolved, true) });
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

    const assignedTrainings = await prisma.training.findMany({
      where: {
        assignedTrainerId: id,
        status: { in: ["assigned", "confirmed"] },
      },
      include: listIncludes,
      orderBy: { startDatetime: "desc" },
      take: 100,
    });

    const fairness = await fairnessForTrainerInMonth(id, new Date());

    res.json({
      item: trainerPayload(trainer, true),
      assigned_trainings: assignedTrainings.map(trainingListItem),
      fairness_current_month: fairnessPayload(fairness),
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
    if (!payload.updated_at) {
      addError(errors, "updated_at", "Missing concurrency token.");
    } else if (!ensureNotStale(existing.updatedAt, payload.updated_at)) {
      return res.status(409).json({
        error: "Trainer was updated by another user. Reload and try again.",
        stale: true,
      });
    }

    const firstName = (payload.first_name || "").trim();
    if (!firstName) {
      addError(errors, "first_name", "This field is required.");
    }
    const lastName = (payload.last_name || "").trim();
    if (!lastName) {
      addError(errors, "last_name", "This field is required.");
    }
    const homeAddress = (payload.home_address || "").trim();
    if (!homeAddress) {
      addError(errors, "home_address", "This field is required.");
    }

    const email = (payload.email || "").trim();
    if (email && !email.includes("@")) {
      addError(errors, "email", "Enter a valid email address.");
    }

    const homeLat = toNumber(payload.home_lat);
    if (payload.home_lat !== undefined && payload.home_lat !== "" && homeLat === null) {
      addError(errors, "home_lat", "Enter a valid latitude.");
    }
    const homeLng = toNumber(payload.home_lng);
    if (payload.home_lng !== undefined && payload.home_lng !== "" && homeLng === null) {
      addError(errors, "home_lng", "Enter a valid longitude.");
    }

    const trainingTypeIds = Array.isArray(payload.training_types)
      ? payload.training_types.map((value) => toInt(value)).filter(Boolean)
      : [];

    const slots = normalizeSlotPayload(payload.availability_slots, errors);

    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.trainer.update({
        where: { id },
        data: {
          firstName,
          lastName,
          titlePrefix: (payload.title_prefix || "").trim() || null,
          titleSuffix: (payload.title_suffix || "").trim() || null,
          email: email || null,
          phone: (payload.phone || "").trim() || null,
          homeAddress,
          homeLat,
          homeLng,
          notes: (payload.notes || "").trim() || null,
          akris: parseBoolean(payload.akris) ?? existing.akris,
          callBeforeTraining:
            parseBoolean(payload.call_before_training) ?? existing.callBeforeTraining,
          frequencyQuantity: (payload.frequency_quantity || "").trim() || null,
          frequencyPeriod: (payload.frequency_period || "").trim() || null,
          limitNote: (payload.limit_note || "").trim() || null,
          hourlyRate: toNumber(payload.hourly_rate),
          travelRateKm: toNumber(payload.travel_rate_km),
        },
      });

      await ensureTrainerSkills(tx, id, Array.from(new Set(trainingTypeIds)));
      await replaceTrainerAvailabilitySlots(tx, id, slots);

      return tx.trainer.findUnique({ where: { id }, include: trainerIncludes });
    });

    let resolved = updated;
    if ((resolved.homeLat === null || resolved.homeLng === null) && resolved.homeAddress) {
      const geo = await geocodeAddress(resolved.homeAddress);
      if (geo) {
        resolved = await prisma.trainer.update({
          where: { id },
          data: { homeLat: geo.lat, homeLng: geo.lng },
          include: trainerIncludes,
        });
      }
    }

    broadcastEvent("invalidate", { entity: "trainer", id });
    res.json({ item: trainerPayload(resolved, true) });
  })
);

api.post(
  "/trainers/bulk-delete/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const ids = Array.isArray(payload.ids) ? payload.ids : [];
    if (!ids.length) {
      return res.status(400).json({ error: "Seznam ID je povinný." });
    }

    const parsedIds = ids.map((value) => toInt(value)).filter(Boolean);
    if (!parsedIds.length) {
      return res.status(400).json({ error: "Neplatná ID trenérů." });
    }

    const uniqueIds = Array.from(new Set(parsedIds));

    await prisma.$transaction(async (tx) => {
      await tx.trainerAvailabilitySlot.deleteMany({
        where: {
          trainerId: { in: uniqueIds },
          assignedTrainingId: null,
        },
      });
      await tx.training.updateMany({
        where: { assignedTrainerId: { in: uniqueIds } },
        data: {
          assignedTrainerId: null,
          status: "open",
        },
      });
      await tx.trainer.deleteMany({ where: { id: { in: uniqueIds } } });
    });

    broadcastEvent("invalidate", { entity: "trainer" });
    broadcastEvent("invalidate", { entity: "training" });
    res.json({ ok: true });
  })
);

api.get(
  "/trainings/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = clampPageLimit(req.query.limit);
    const cursorId = decodeCursor(req.query.cursor);
    if (req.query.cursor && !cursorId) {
      return res.status(400).json({ error: "Invalid cursor." });
    }

    const filters = [];
    const status = normalizeStatus(req.query.status, "");
    if (status) {
      filters.push({ status });
    }

    const trainingTypeId = toInt(req.query.training_type);
    if (trainingTypeId) {
      filters.push({ trainingTypeId });
    }

    const startDate = parseDateOnly(req.query.start_date);
    const endDate = parseDateOnly(req.query.end_date);

    if (startDate) {
      filters.push({
        OR: [
          { requestWindowEnd: { gte: startOfDay(startDate) } },
          { requestWindowEnd: null, startDatetime: { gte: startOfDay(startDate) } },
        ],
      });
    }

    if (endDate) {
      filters.push({
        OR: [
          { requestWindowStart: { lte: endOfDay(endDate) } },
          { requestWindowStart: null, startDatetime: { lte: endOfDay(endDate) } },
        ],
      });
    }

    if (req.query.no_trainer) {
      filters.push({
        assignedTrainerId: null,
        status: { in: ["draft", "open"] },
      });
    }

    const baseWhere = filters.length ? { AND: filters } : undefined;
    const where =
      cursorId && baseWhere
        ? { AND: [baseWhere, { id: { lt: cursorId } }] }
        : cursorId
          ? { id: { lt: cursorId } }
          : baseWhere;

    const [trainings, totalCount] = await Promise.all([
      prisma.training.findMany({
        where,
        include: listIncludes,
        orderBy: [{ id: "desc" }],
        take: limit + 1,
      }),
      prisma.training.count({ where: baseWhere }),
    ]);

    const hasMore = trainings.length > limit;
    const page = hasMore ? trainings.slice(0, limit) : trainings;
    const nextCursor = hasMore && page.length ? encodeCursor(page[page.length - 1].id) : null;
    res.json({
      items: page.map(trainingListItem),
      next_cursor: nextCursor,
      total_count: totalCount,
    });
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

    const { windowStart, windowEnd } = parseWindowRange(payload, errors);

    const status = normalizeStatus(payload.status, "open");
    if (!VALID_STATUSES.has(status)) {
      addError(errors, "status", "Select a valid status.");
    }
    if (status === "assigned" || status === "confirmed") {
      addError(errors, "status", "Use assignment action to set assigned/confirmed.");
    }

    const lat = toNumber(payload.lat);
    if (payload.lat !== undefined && payload.lat !== "" && lat === null) {
      addError(errors, "lat", "Enter a valid latitude.");
    }

    const lng = toNumber(payload.lng);
    if (payload.lng !== undefined && payload.lng !== "" && lng === null) {
      addError(errors, "lng", "Enter a valid longitude.");
    }

    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }

    const trainingType = await prisma.trainingType.findUnique({ where: { id: trainingTypeId } });
    if (!trainingType) {
      addError(errors, "training_type", "Select a valid training type.");
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

    const fallback = fallbackAssignmentTime(windowStart, trainingType);
    const created = await prisma.training.create({
      data: {
        trainingTypeId,
        customerName: (payload.customer_name || "").trim() || null,
        address,
        lat: resolvedLat,
        lng: resolvedLng,
        requestWindowStart: windowStart,
        requestWindowEnd: windowEnd,
        startDatetime: fallback.start,
        endDatetime: fallback.end,
        status,
        assignmentReason: (payload.assignment_reason || "").trim() || null,
        notes: (payload.notes || "").trim() || null,
        changedBy: req.session.user.username,
      },
      include: listIncludes,
    });

    broadcastEvent("invalidate", { entity: "training", id: created.id });
    res.status(201).json({ item: trainingPayload(created, null) });
  })
);

api.get(
  "/trainings/:id/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (!id) {
      return res.status(404).json({ error: "Training request not found." });
    }

    const training = await prisma.training.findUnique({
      where: { id },
      include: listIncludes,
    });
    if (!training) {
      return res.status(404).json({ error: "Training request not found." });
    }

    const assignedSlot = await prisma.trainerAvailabilitySlot.findFirst({
      where: { assignedTrainingId: id },
    });

    const recommendations =
      training.status === "canceled"
        ? []
        : await recommendationsForTraining({
            ...training,
            status: normalizeStatus(training.status, "open"),
          });

    res.json({
      item: trainingPayload(training, assignedSlot),
      recommendations: {
        matches: recommendations,
        generated_at: new Date().toISOString(),
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
      return res.status(404).json({ error: "Training request not found." });
    }

    const existing = await prisma.training.findUnique({
      where: { id },
      include: { trainingType: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "Training request not found." });
    }

    const payload = req.body || {};
    const errors = {};
    if (!payload.updated_at) {
      addError(errors, "updated_at", "Missing concurrency token.");
    } else if (!ensureNotStale(existing.updatedAt, payload.updated_at)) {
      return res.status(409).json({
        error: "Request was updated by another user. Reload and try again.",
        stale: true,
      });
    }

    const trainingTypeId = toInt(payload.training_type);
    if (!trainingTypeId) {
      addError(errors, "training_type", "This field is required.");
    }

    const address = (payload.address || "").trim();
    if (!address) {
      addError(errors, "address", "This field is required.");
    }

    const { windowStart, windowEnd } = parseWindowRange(payload, errors);

    const status = normalizeStatus(payload.status, existing.status);
    if (!VALID_STATUSES.has(status)) {
      addError(errors, "status", "Select a valid status.");
    }

    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }

    const trainingType = await prisma.trainingType.findUnique({ where: { id: trainingTypeId } });
    if (!trainingType) {
      addError(errors, "training_type", "Select a valid training type.");
      return res.status(400).json({ errors });
    }

    const assignedSlot = await prisma.trainerAvailabilitySlot.findFirst({
      where: { assignedTrainingId: id },
    });

    if ((status === "assigned" || status === "confirmed") && !assignedSlot) {
      addError(errors, "status", "Assigned/confirmed status requires an assigned slot.");
      return res.status(400).json({ errors });
    }

    let resolvedLat = toNumber(payload.lat);
    let resolvedLng = toNumber(payload.lng);
    if (resolvedLat === null || resolvedLng === null) {
      const geo = await geocodeAddress(address);
      if (geo) {
        resolvedLat = geo.lat;
        resolvedLng = geo.lng;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if ((status === "draft" || status === "open" || status === "canceled") && assignedSlot) {
        await tx.trainerAvailabilitySlot.update({
          where: { id: assignedSlot.id },
          data: { assignedTrainingId: null },
        });
      }

      let startDatetime = existing.startDatetime;
      let endDatetime = existing.endDatetime;
      let assignedTrainerId = existing.assignedTrainerId;
      if (status === "draft" || status === "open" || status === "canceled") {
        const fallback = fallbackAssignmentTime(windowStart, trainingType);
        startDatetime = fallback.start;
        endDatetime = fallback.end;
        assignedTrainerId = null;
      }

      return tx.training.update({
        where: { id },
        data: {
          trainingTypeId,
          customerName: (payload.customer_name || "").trim() || null,
          address,
          lat: resolvedLat,
          lng: resolvedLng,
          requestWindowStart: windowStart,
          requestWindowEnd: windowEnd,
          startDatetime,
          endDatetime,
          status,
          assignedTrainerId,
          assignmentReason: (payload.assignment_reason || "").trim() || null,
          notes: (payload.notes || "").trim() || null,
          changedBy: req.session.user.username,
        },
        include: listIncludes,
      });
    });

    const refreshedSlot = await prisma.trainerAvailabilitySlot.findFirst({
      where: { assignedTrainingId: id },
    });

    broadcastEvent("invalidate", { entity: "training", id });
    res.json({ item: trainingPayload(updated, refreshedSlot) });
  })
);

api.patch(
  "/trainings/:id/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (!id) {
      return res.status(404).json({ error: "Training request not found." });
    }

    const existing = await prisma.training.findUnique({
      where: { id },
      include: { trainingType: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "Training request not found." });
    }

    const payload = req.body || {};
    if (!payload.updated_at) {
      return res.status(400).json({
        errors: { updated_at: [{ message: "Missing concurrency token." }] },
      });
    }
    if (!ensureNotStale(existing.updatedAt, payload.updated_at)) {
      return res.status(409).json({
        error: "Request was updated by another user. Reload and try again.",
        stale: true,
      });
    }

    const nextStatus =
      payload.status === undefined ? existing.status : normalizeStatus(payload.status, existing.status);

    if (!VALID_STATUSES.has(nextStatus)) {
      return res.status(400).json({ errors: { status: [{ message: "Select a valid status." }] } });
    }

    const assignedSlot = await prisma.trainerAvailabilitySlot.findFirst({
      where: { assignedTrainingId: id },
    });

    if ((nextStatus === "assigned" || nextStatus === "confirmed") && !assignedSlot) {
      return res.status(400).json({
        errors: { status: [{ message: "Assigned/confirmed status requires an assigned slot." }] },
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (nextStatus === "draft" || nextStatus === "open" || nextStatus === "canceled") {
        if (assignedSlot) {
          return releaseTrainingSlot(
            tx,
            existing,
            existing.trainingType,
            nextStatus,
            req.session.user.username
          );
        }
        const fallback = fallbackAssignmentTime(
          existing.requestWindowStart || existing.startDatetime,
          existing.trainingType
        );
        return tx.training.update({
          where: { id },
          data: {
            status: nextStatus,
            assignedTrainerId: null,
            startDatetime: fallback.start,
            endDatetime: fallback.end,
            customerName:
              payload.customer_name === undefined
                ? existing.customerName
                : (payload.customer_name || "").trim() || null,
            assignmentReason:
              payload.assignment_reason === undefined
                ? existing.assignmentReason
                : (payload.assignment_reason || "").trim() || null,
            notes:
              payload.notes === undefined ? existing.notes : (payload.notes || "").trim() || null,
            changedBy: req.session.user.username,
          },
          include: listIncludes,
        });
      }

      return tx.training.update({
        where: { id },
        data: {
          status: nextStatus,
          customerName:
            payload.customer_name === undefined
              ? existing.customerName
              : (payload.customer_name || "").trim() || null,
          assignmentReason:
            payload.assignment_reason === undefined
              ? existing.assignmentReason
              : (payload.assignment_reason || "").trim() || null,
          notes: payload.notes === undefined ? existing.notes : (payload.notes || "").trim() || null,
          changedBy: req.session.user.username,
        },
        include: listIncludes,
      });
    });

    const refreshedSlot = await prisma.trainerAvailabilitySlot.findFirst({
      where: { assignedTrainingId: id },
    });

    broadcastEvent("invalidate", { entity: "training", id });
    res.json({ item: trainingPayload(updated, refreshedSlot) });
  })
);

api.post(
  "/trainings/:id/assign/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (!id) {
      return res.status(404).json({ error: "Training request not found." });
    }

    const payload = req.body || {};
    const slotId = toInt(payload.slot_id);
    if (!slotId) {
      return res.status(400).json({ errors: { slot_id: [{ message: "Select a valid slot." }] } });
    }
    if (!payload.updated_at) {
      return res.status(400).json({ errors: { updated_at: [{ message: "Missing concurrency token." }] } });
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const training = await tx.training.findUnique({
          where: { id },
          include: { trainingType: true, assignedTrainer: true },
        });
        if (!training) {
          throw Object.assign(new Error("not-found"), { code: "NOT_FOUND" });
        }
        if (!ensureNotStale(training.updatedAt, payload.updated_at)) {
          throw Object.assign(new Error("stale"), { code: "STALE" });
        }
        if (training.status === "canceled") {
          throw Object.assign(new Error("canceled"), { code: "CANCELED" });
        }

        const slot = await tx.trainerAvailabilitySlot.findUnique({
          where: { id: slotId },
          include: {
            trainer: { include: { skills: true } },
          },
        });
        if (!slot) {
          throw Object.assign(new Error("slot-not-found"), { code: "SLOT_NOT_FOUND" });
        }
        if (!slot.isActive) {
          throw Object.assign(new Error("slot-inactive"), { code: "SLOT_INACTIVE" });
        }

        const windowStart = training.requestWindowStart || training.startDatetime;
        const windowEnd = training.requestWindowEnd || training.endDatetime;
        if (slot.startDatetime < windowStart || slot.endDatetime > windowEnd) {
          throw Object.assign(new Error("slot-outside-window"), { code: "SLOT_OUTSIDE_WINDOW" });
        }

        const requiredDurationMs = durationMinutesForType(training.trainingType) * 60000;
        if (slot.endDatetime.getTime() - slot.startDatetime.getTime() < requiredDurationMs) {
          throw Object.assign(new Error("slot-too-short"), { code: "SLOT_TOO_SHORT" });
        }

        const skillIds = new Set((slot.trainer.skills || []).map((skill) => skill.trainingTypeId));
        if (!skillIds.has(training.trainingTypeId)) {
          throw Object.assign(new Error("topic-mismatch"), { code: "TOPIC_MISMATCH" });
        }

        const currentSlot = await tx.trainerAvailabilitySlot.findFirst({
          where: { assignedTrainingId: id },
        });

        if (currentSlot && currentSlot.id !== slot.id) {
          await tx.trainerAvailabilitySlot.update({
            where: { id: currentSlot.id },
            data: { assignedTrainingId: null },
          });
        }

        if (slot.assignedTrainingId && slot.assignedTrainingId !== id) {
          throw Object.assign(new Error("slot-taken"), { code: "SLOT_TAKEN" });
        }

        if (slot.assignedTrainingId !== id) {
          const claim = await tx.trainerAvailabilitySlot.updateMany({
            where: {
              id: slot.id,
              assignedTrainingId: null,
              isActive: true,
            },
            data: {
              assignedTrainingId: id,
            },
          });

          if (!claim.count) {
            throw Object.assign(new Error("slot-taken"), { code: "SLOT_TAKEN" });
          }
        }

        const assignmentReason =
          (payload.assignment_reason || "").trim() ||
          "Přiřazeno podle dostupného slotu, tématu a fairness skóre.";

        const updatedTraining = await tx.training.update({
          where: { id },
          data: {
            assignedTrainerId: slot.trainerId,
            startDatetime: slot.startDatetime,
            endDatetime: slot.endDatetime,
            status: payload.confirmed ? "confirmed" : "assigned",
            assignmentReason,
            changedBy: req.session.user.username,
          },
          include: listIncludes,
        });

        return { updatedTraining, slotId: slot.id };
      });

      const assignedSlot = await prisma.trainerAvailabilitySlot.findFirst({
        where: { assignedTrainingId: id },
      });

      broadcastEvent("invalidate", { entity: "training", id });
      res.json({ item: trainingPayload(result.updatedTraining, assignedSlot) });
    } catch (err) {
      if (err.code === "NOT_FOUND") {
        return res.status(404).json({ error: "Training request not found." });
      }
      if (err.code === "CANCELED") {
        return res.status(400).json({ error: "Canceled request cannot be assigned." });
      }
      if (err.code === "STALE") {
        return res.status(409).json({
          error: "Request was updated by another user. Reload and try again.",
          stale: true,
        });
      }
      if (err.code === "SLOT_NOT_FOUND") {
        return res.status(404).json({ error: "Slot not found." });
      }
      if (err.code === "SLOT_TAKEN") {
        return res.status(409).json({
          error: "Slot was already taken. Refresh candidates and choose another slot.",
        });
      }
      if (
        err.code === "TOPIC_MISMATCH" ||
        err.code === "SLOT_TOO_SHORT" ||
        err.code === "SLOT_OUTSIDE_WINDOW" ||
        err.code === "SLOT_INACTIVE"
      ) {
        return res.status(400).json({ error: "Selected slot is no longer valid for this request." });
      }
      throw err;
    }
  })
);

api.post(
  "/trainings/bulk-delete/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const ids = Array.isArray(payload.ids) ? payload.ids.map((value) => toInt(value)).filter(Boolean) : [];
    if (!ids.length) {
      return res.status(400).json({ error: "Seznam ID je povinný." });
    }

    const uniqueIds = Array.from(new Set(ids));

    await prisma.$transaction(async (tx) => {
      await tx.trainerAvailabilitySlot.updateMany({
        where: { assignedTrainingId: { in: uniqueIds } },
        data: { assignedTrainingId: null },
      });
      await tx.training.deleteMany({ where: { id: { in: uniqueIds } } });
    });

    broadcastEvent("invalidate", { entity: "training" });
    res.json({ ok: true });
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
      include: listIncludes,
      orderBy: { startDatetime: "asc" },
    });

    const trainingsByDay = {};
    trainings.forEach((training) => {
      const key = formatDate(training.startDatetime);
      if (!trainingsByDay[key]) {
        trainingsByDay[key] = [];
      }
      trainingsByDay[key].push(training);
    });

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
      monthDays.slice(i, i + 7).forEach((day) => {
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
      });
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

    res.json({
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
      include: listIncludes,
      orderBy: { startDatetime: "asc" },
    });

    const trainingsByDay = {};
    trainings.forEach((training) => {
      const key = formatDate(training.startDatetime);
      if (!trainingsByDay[key]) {
        trainingsByDay[key] = [];
      }
      trainingsByDay[key].push(training);
    });

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

    res.json({
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

module.exports = {
  app,
  server,
  shutdown,
};
