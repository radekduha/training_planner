import { requestJson } from "./client.js";

export const fetchTrainers = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    search.set(key, value);
  });
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return requestJson(`/trainers/${suffix}`);
};

export const fetchTrainer = (id) => requestJson(`/trainers/${id}/`);

export const createTrainer = (payload) =>
  requestJson("/trainers/", { method: "POST", body: payload });

export const updateTrainer = (id, payload) =>
  requestJson(`/trainers/${id}/`, { method: "PUT", body: payload });

export const importTrainers = (payload) =>
  requestJson("/trainers/import/", { method: "POST", body: payload });

export const bulkDeleteTrainers = (payload) =>
  requestJson("/trainers/bulk-delete/", { method: "POST", body: payload });
