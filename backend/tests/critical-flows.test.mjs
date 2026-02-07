import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

const backendDir =
  path.basename(process.cwd()) === "backend"
    ? process.cwd()
    : path.resolve(process.cwd(), "backend");
const port = 3217;
const baseUrl = `http://127.0.0.1:${port}`;
const templateDb = path.join(backendDir, "prisma", "db.sqlite3");
const dbFile = path.join(backendDir, "prisma", "test-critical.sqlite3");
const dbUrl = `file:${dbFile}`;

let prisma;
let shutdown;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class ApiClient {
  constructor() {
    this.cookies = new Map();
    this.csrfToken = "";
  }

  setCookieString(rawCookie) {
    if (!rawCookie) {
      return;
    }
    const [pair] = rawCookie.split(";");
    const [name, value] = pair.split("=");
    this.cookies.set(name, value);
  }

  applySetCookie(headers) {
    const setCookie = headers.get("set-cookie");
    if (!setCookie) {
      return;
    }
    const parts = setCookie.split(/, (?=[^;]+=[^;]+)/g);
    parts.forEach((cookie) => this.setCookieString(cookie));
  }

  cookieHeader() {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  async ensureCsrf() {
    const response = await fetch(`${baseUrl}/api/csrf/`);
    this.applySetCookie(response.headers);
    this.csrfToken = this.cookies.get("csrftoken") || "";
    assert.equal(response.status, 200);
  }

  async request(pathname, { method = "GET", body } = {}) {
    const headers = { Accept: "application/json" };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    const cookie = this.cookieHeader();
    if (cookie) {
      headers.Cookie = cookie;
    }
    if (method !== "GET" && method !== "HEAD") {
      headers["X-CSRFToken"] = this.csrfToken;
    }

    const response = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    this.applySetCookie(response.headers);
    const json = await response.json().catch(() => ({}));
    return { status: response.status, json };
  }

  async login() {
    await this.ensureCsrf();
    const response = await this.request("/api/login/", {
      method: "POST",
      body: { username: "admin", password: "admin" },
    });
    assert.equal(response.status, 200, `Login failed: ${JSON.stringify(response.json)}`);
  }
}

const iso = (date) => new Date(date).toISOString();

const createTopic = async (api, name, durationMinutes = 180) => {
  const response = await api.request("/api/training-types/", {
    method: "POST",
    body: { name, duration_minutes: durationMinutes },
  });
  assert.equal(response.status, 201, JSON.stringify(response.json));
  return response.json.item;
};

const createTrainer = async (api, { firstName, lastName, topicId, slotStart, slotEnd }) => {
  const response = await api.request("/api/trainers/", {
    method: "POST",
    body: {
      first_name: firstName,
      last_name: lastName,
      home_address: "Prague",
      training_types: [String(topicId)],
      availability_slots: [
        {
          start_datetime: slotStart,
          end_datetime: slotEnd,
          is_active: true,
        },
      ],
    },
  });
  assert.equal(response.status, 201, JSON.stringify(response.json));
  return response.json.item;
};

const createRequest = async (api, payload) => {
  const response = await api.request("/api/trainings/", {
    method: "POST",
    body: payload,
  });
  assert.equal(response.status, 201, JSON.stringify(response.json));
  return response.json.item;
};

const fetchRequestDetail = async (api, id) => {
  const response = await api.request(`/api/trainings/${id}/`);
  assert.equal(response.status, 200, JSON.stringify(response.json));
  return response.json;
};

before(async () => {
  if (existsSync(dbFile)) {
    rmSync(dbFile, { force: true });
  }
  copyFileSync(templateDb, dbFile);

  process.env.PORT = String(port);
  process.env.DATABASE_URL = dbUrl;
  process.env.SESSION_SECRET = "test-secret-12345678901234567890";
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD = "admin";

  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient({
    datasources: {
      db: { url: dbUrl },
    },
  });

  const serverModule = await import("../src/server.js");
  shutdown = serverModule?.default?.shutdown || serverModule.shutdown;

  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/csrf/`);
      if (response.status === 200) {
        break;
      }
    } catch (err) {
      // wait
    }
    await sleep(100);
  }
});

after(async () => {
  if (typeof shutdown === "function") {
    await shutdown();
  }
  if (prisma) {
    await prisma.$disconnect();
  }
  if (existsSync(dbFile)) {
    rmSync(dbFile, { force: true });
  }
});

const resetData = async () => {
  await prisma.trainerAvailabilitySlot.deleteMany();
  await prisma.training.deleteMany();
  await prisma.trainerSkill.deleteMany();
  await prisma.trainerRule.deleteMany();
  await prisma.trainer.deleteMany();
  await prisma.trainingType.deleteMany();
};

test("default 30-day window and slot recommendations", async () => {
  await resetData();
  const api = new ApiClient();
  await api.login();

  const topic = await createTopic(api, "Critical Topic A", 180);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const slotStart = iso(tomorrow);
  const slotEnd = iso(new Date(tomorrow.getTime() + 3 * 60 * 60 * 1000));

  await createTrainer(api, {
    firstName: "Window",
    lastName: "Trainer",
    topicId: topic.id,
    slotStart,
    slotEnd,
  });

  const created = await createRequest(api, {
    training_type: String(topic.id),
    customer_name: "Org A",
    address: "Prague",
  });

  assert.ok(created.request_window_start, "request_window_start missing");
  assert.ok(created.request_window_end, "request_window_end missing");

  const start = new Date(created.request_window_start).getTime();
  const end = new Date(created.request_window_end).getTime();
  const diffDays = (end - start) / (24 * 60 * 60 * 1000);
  assert.ok(diffDays >= 29 && diffDays <= 31.5, `Unexpected default window days: ${diffDays}`);

  const detail = await fetchRequestDetail(api, created.id);
  assert.ok((detail.recommendations.matches || []).length > 0, "Expected at least one recommendation");
});

test("concurrent assignment conflict and slot release on open/cancel", async () => {
  await resetData();
  const api = new ApiClient();
  await api.login();

  const topic = await createTopic(api, "Critical Topic B", 120);

  const day = new Date();
  day.setDate(day.getDate() + 2);
  day.setHours(10, 0, 0, 0);

  const slotStart = iso(day);
  const slotEnd = iso(new Date(day.getTime() + 2 * 60 * 60 * 1000));

  const trainer = await createTrainer(api, {
    firstName: "Conflict",
    lastName: "Trainer",
    topicId: topic.id,
    slotStart,
    slotEnd,
  });

  const windowStart = iso(new Date(day.getTime() - 6 * 60 * 60 * 1000));
  const windowEnd = iso(new Date(day.getTime() + 6 * 60 * 60 * 1000));

  const request1 = await createRequest(api, {
    training_type: String(topic.id),
    customer_name: "Org B1",
    address: "Prague",
    request_window_start: windowStart,
    request_window_end: windowEnd,
  });

  const request2 = await createRequest(api, {
    training_type: String(topic.id),
    customer_name: "Org B2",
    address: "Prague",
    request_window_start: windowStart,
    request_window_end: windowEnd,
  });

  const detail1 = await fetchRequestDetail(api, request1.id);
  const detail2 = await fetchRequestDetail(api, request2.id);
  const slotId = detail1.recommendations.matches?.[0]?.slot?.id;
  assert.ok(slotId, "Slot ID missing for conflict test");

  const [assign1, assign2] = await Promise.all([
    api.request(`/api/trainings/${request1.id}/assign/`, {
      method: "POST",
      body: { slot_id: slotId, updated_at: detail1.item.updated_at },
    }),
    api.request(`/api/trainings/${request2.id}/assign/`, {
      method: "POST",
      body: { slot_id: slotId, updated_at: detail2.item.updated_at },
    }),
  ]);

  const statuses = [assign1.status, assign2.status].sort((a, b) => a - b);
  assert.deepEqual(statuses, [200, 409], "Expected one success and one conflict");

  const winner = assign1.status === 200 ? assign1.json.item : assign2.json.item;
  const loserId = assign1.status === 200 ? request2.id : request1.id;

  const loserDetailWhileTaken = await fetchRequestDetail(api, loserId);
  const hasSameSlotWhileTaken = (loserDetailWhileTaken.recommendations.matches || []).some(
    (match) => match.slot.id === slotId
  );
  assert.equal(hasSameSlotWhileTaken, false, "Taken slot should not be recommended to loser");

  const reopen = await api.request(`/api/trainings/${winner.id}/`, {
    method: "PATCH",
    body: { status: "open", updated_at: winner.updated_at },
  });
  assert.equal(reopen.status, 200, JSON.stringify(reopen.json));

  const loserDetailAfterRelease = await fetchRequestDetail(api, loserId);
  const hasSameSlotAfterRelease = (loserDetailAfterRelease.recommendations.matches || []).some(
    (match) => match.slot.id === slotId
  );
  assert.equal(hasSameSlotAfterRelease, true, "Released slot should be recommended again");

  const assignLoser = await api.request(`/api/trainings/${loserId}/assign/`, {
    method: "POST",
    body: {
      slot_id: slotId,
      updated_at: loserDetailAfterRelease.item.updated_at,
    },
  });
  assert.equal(assignLoser.status, 200, JSON.stringify(assignLoser.json));

  const cancelLoser = await api.request(`/api/trainings/${loserId}/`, {
    method: "PATCH",
    body: { status: "canceled", updated_at: assignLoser.json.item.updated_at },
  });
  assert.equal(cancelLoser.status, 200, JSON.stringify(cancelLoser.json));

  const trainerDetail = await api.request(`/api/trainers/${trainer.id}/`);
  assert.equal(trainerDetail.status, 200, JSON.stringify(trainerDetail.json));
  const fairness = trainerDetail.json.fairness_current_month;
  assert.equal(typeof fairness.offered_days, "number");
  assert.equal(typeof fairness.delivered_days, "number");
  assert.equal(typeof fairness.within_tolerance, "boolean");

  const slotAfterCancel = (trainerDetail.json.item.availability_slots || []).find((slot) => slot.id === slotId);
  assert.ok(slotAfterCancel, "Expected slot in trainer detail");
  assert.equal(slotAfterCancel.assigned_training_id, null, "Canceled request should release slot");
});

test("optimistic locking prevents stale writes", async () => {
  await resetData();
  const api = new ApiClient();
  await api.login();

  const topic = await createTopic(api, "Critical Topic C", 90);
  const day = new Date();
  day.setDate(day.getDate() + 3);
  day.setHours(8, 0, 0, 0);

  await createTrainer(api, {
    firstName: "Stale",
    lastName: "Trainer",
    topicId: topic.id,
    slotStart: iso(day),
    slotEnd: iso(new Date(day.getTime() + 90 * 60 * 1000)),
  });

  const request = await createRequest(api, {
    training_type: String(topic.id),
    customer_name: "Org C",
    address: "Prague",
  });

  const freshUpdate = await api.request(`/api/trainings/${request.id}/`, {
    method: "PATCH",
    body: {
      customer_name: "Org C Updated",
      updated_at: request.updated_at,
    },
  });
  assert.equal(freshUpdate.status, 200, JSON.stringify(freshUpdate.json));

  const staleUpdate = await api.request(`/api/trainings/${request.id}/`, {
    method: "PATCH",
    body: {
      notes: "This should fail",
      updated_at: request.updated_at,
    },
  });
  assert.equal(staleUpdate.status, 409, JSON.stringify(staleUpdate.json));

  const stalePutUpdate = await api.request(`/api/trainings/${request.id}/`, {
    method: "PUT",
    body: {
      updated_at: request.updated_at,
    },
  });
  assert.equal(stalePutUpdate.status, 409, JSON.stringify(stalePutUpdate.json));

  const trainerList = await api.request("/api/trainers/?limit=1");
  assert.equal(trainerList.status, 200, JSON.stringify(trainerList.json));
  const trainerId = trainerList.json.items?.[0]?.id;
  assert.ok(trainerId, "Expected at least one trainer");

  const trainerDetail = await api.request(`/api/trainers/${trainerId}/`);
  assert.equal(trainerDetail.status, 200, JSON.stringify(trainerDetail.json));
  const staleTrainerToken = trainerDetail.json.item.updated_at;

  const editableSlots = trainerDetail.json.item.availability_slots
    .filter((slot) => !slot.assigned_training_id)
    .map((slot) => ({
      start_datetime: slot.start_datetime,
      end_datetime: slot.end_datetime,
      is_active: slot.is_active,
    }));

  const payload = {
    first_name: trainerDetail.json.item.first_name,
    last_name: trainerDetail.json.item.last_name,
    home_address: trainerDetail.json.item.home_address,
    email: trainerDetail.json.item.email,
    phone: trainerDetail.json.item.phone,
    notes: "fresh update",
    training_types: trainerDetail.json.item.training_types.map((type) => type.id),
    availability_slots: editableSlots,
    updated_at: staleTrainerToken,
  };

  const freshTrainerUpdate = await api.request(`/api/trainers/${trainerId}/`, {
    method: "PUT",
    body: payload,
  });
  assert.equal(freshTrainerUpdate.status, 200, JSON.stringify(freshTrainerUpdate.json));

  const staleTrainerUpdate = await api.request(`/api/trainers/${trainerId}/`, {
    method: "PUT",
    body: {
      ...payload,
      notes: "stale update should fail",
      updated_at: staleTrainerToken,
    },
  });
  assert.equal(staleTrainerUpdate.status, 409, JSON.stringify(staleTrainerUpdate.json));
});
