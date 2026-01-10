import { requestJson } from "./client.js";

export const fetchTrainingTypes = () => requestJson("/training-types/");

export const createTrainingType = (payload) =>
  requestJson("/training-types/", { method: "POST", body: payload });
