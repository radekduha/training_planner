import { requestJson } from "./client.js";

export const fetchTrainings = async (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    params.set(key, value);
  });
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestJson(`/trainings/${suffix}`);
};

export const fetchTraining = (id) => requestJson(`/trainings/${id}/`);

export const createTraining = (payload) =>
  requestJson("/trainings/", { method: "POST", body: payload });

export const updateTraining = (id, payload) =>
  requestJson(`/trainings/${id}/`, { method: "PUT", body: payload });

export const patchTraining = (id, payload) =>
  requestJson(`/trainings/${id}/`, { method: "PATCH", body: payload });

export const importTrainings = (payload) =>
  requestJson("/trainings/import/", { method: "POST", body: payload });

export const bulkDeleteTrainings = (payload) =>
  requestJson("/trainings/bulk-delete/", { method: "POST", body: payload });
