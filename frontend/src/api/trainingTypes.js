import { requestJson } from "./client.js";

export const fetchTrainingTypes = () => requestJson("/training-types/");

export const fetchTrainingType = (id) => requestJson(`/training-types/${id}/`);

export const createTrainingType = (payload) =>
  requestJson("/training-types/", { method: "POST", body: payload });

export const updateTrainingType = (id, payload) =>
  requestJson(`/training-types/${id}/`, { method: "PUT", body: payload });

export const deleteTrainingType = (id) => requestJson(`/training-types/${id}/`, { method: "DELETE" });

export const importTrainingTypes = (payload) =>
  requestJson("/training-types/import/", { method: "POST", body: payload });

export const importTrainingTypeMetrics = (payload) =>
  requestJson("/training-types/import-metrics/", { method: "POST", body: payload });

export const bulkDeleteTrainingTypes = (payload) =>
  requestJson("/training-types/bulk-delete/", { method: "POST", body: payload });
