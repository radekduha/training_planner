const API_BASE = "/api";

const getCookie = (name) => {
  if (!document.cookie) {
    return null;
  }
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.trim().split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
};

export const ensureCsrf = async () => {
  await fetch(`${API_BASE}/csrf/`, { credentials: "include" });
};

export const requestJson = async (path, options = {}) => {
  const { method = "GET", body } = options;
  const headers = new Headers({
    Accept: "application/json",
  });
  let payload;
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }
  if (method !== "GET" && method !== "HEAD") {
    const csrfToken = getCookie("csrftoken");
    if (csrfToken) {
      headers.set("X-CSRFToken", csrfToken);
    }
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: payload,
    credentials: "include",
  });
  if (response.redirected && response.url.includes("/login")) {
    if (typeof window !== "undefined") {
      window.location.assign(response.url);
      return new Promise(() => {});
    }
  }
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await response.json().catch(() => ({})) : await response.text().catch(() => "");
  if (!response.ok || !isJson) {
    if (!isJson && typeof data === "string" && data.includes("Login")) {
      if (typeof window !== "undefined") {
        window.location.assign("/login/");
        return new Promise(() => {});
      }
    }
    const detail =
      typeof data === "string" && data
        ? data.slice(0, 120)
        : data && typeof data === "object"
          ? data.error || ""
          : "";
    const suffix = detail ? ` ${detail}` : "";
    const error = new Error(`Request failed (${response.status}).${suffix}`);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
};
