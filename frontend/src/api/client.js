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
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Request failed.");
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
};
