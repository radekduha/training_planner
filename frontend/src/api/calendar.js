import { requestJson } from "./client.js";

export const fetchCalendarMonth = (params = {}) => {
  const search = new URLSearchParams();
  if (params.year) {
    search.set("year", params.year);
  }
  if (params.month) {
    search.set("month", params.month);
  }
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return requestJson(`/calendar/month/${suffix}`);
};

export const fetchCalendarWeek = (params = {}) => {
  const search = new URLSearchParams();
  if (params.date) {
    search.set("date", params.date);
  }
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return requestJson(`/calendar/week/${suffix}`);
};
