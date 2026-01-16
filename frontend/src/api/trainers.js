import { requestJson } from "./client.js";

export const fetchTrainers = () => requestJson("/trainers/");

export const fetchTrainer = (id) => requestJson(`/trainers/${id}/`);

export const createTrainer = (payload) =>
  requestJson("/trainers/", { method: "POST", body: payload });

export const updateTrainer = (id, payload) =>
  requestJson(`/trainers/${id}/`, { method: "PUT", body: payload });

export const importTrainers = (payload) =>
  requestJson("/trainers/import/", { method: "POST", body: payload });
