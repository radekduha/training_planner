import { requestJson } from "./client.js";

export const fetchMeta = () => requestJson("/meta/");
