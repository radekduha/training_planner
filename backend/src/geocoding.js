const { prisma } = require("./db");
const config = require("./env");

const parseNumber = (value) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
};

const isValidLat = (value) => Number.isFinite(value) && value >= -90 && value <= 90;
const isValidLng = (value) => Number.isFinite(value) && value >= -180 && value <= 180;

const asCoords = (lat, lng, provider = "url") => {
  if (!isValidLat(lat) || !isValidLng(lng)) {
    return null;
  }
  return { lat, lng, provider };
};

const parseLatLngPair = (value, provider = "url") => {
  if (typeof value !== "string") {
    return null;
  }
  const match = value.trim().match(/(-?\d{1,3}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!match) {
    return null;
  }
  const lat = parseNumber(match[1]);
  const lng = parseNumber(match[2]);
  return asCoords(lat, lng, provider);
};

const extractCoordinatesFromUrl = (value) => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch (err) {
    return null;
  }

  for (const key of ["q", "query", "ll", "center"]) {
    const pair = parseLatLngPair(parsed.searchParams.get(key), "url-param");
    if (pair) {
      return pair;
    }
  }

  const mlat = parseNumber(parsed.searchParams.get("mlat"));
  const mlon = parseNumber(parsed.searchParams.get("mlon"));
  const osmPair = asCoords(mlat, mlon, "openstreetmap");
  if (osmPair) {
    return osmPair;
  }

  const mapyY = parseNumber(parsed.searchParams.get("y"));
  const mapyX = parseNumber(parsed.searchParams.get("x"));
  const mapyPair = asCoords(mapyY, mapyX, "mapy-cz");
  if (mapyPair) {
    return mapyPair;
  }

  const atPath = normalized.match(/@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/);
  if (atPath) {
    const pair = asCoords(parseNumber(atPath[1]), parseNumber(atPath[2]), "google-maps");
    if (pair) {
      return pair;
    }
  }

  const osmHash = parsed.hash.match(/map=\d+(?:\.\d+)?\/(-?\d{1,3}(?:\.\d+)?)\/(-?\d{1,3}(?:\.\d+)?)/);
  if (osmHash) {
    const pair = asCoords(parseNumber(osmHash[1]), parseNumber(osmHash[2]), "openstreetmap");
    if (pair) {
      return pair;
    }
  }

  const googleBang = normalized.match(/!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/);
  if (googleBang) {
    const pair = asCoords(parseNumber(googleBang[1]), parseNumber(googleBang[2]), "google-maps");
    if (pair) {
      return pair;
    }
  }

  return null;
};

const geocodeAddress = async (address) => {
  const normalized = (address || "").trim();
  if (!normalized) {
    return null;
  }

  const cached = await prisma.geocodingCache.findFirst({
    where: { address: normalized },
  });
  if (cached) {
    return { lat: cached.lat, lng: cached.lng, provider: cached.provider };
  }

  const fromUrl = extractCoordinatesFromUrl(normalized);
  if (fromUrl) {
    return fromUrl;
  }

  if (config.geocodingProvider !== "nominatim") {
    return null;
  }

  const params = new URLSearchParams({ q: normalized, format: "json", limit: "1" });
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": config.geocodingUserAgent },
      signal: controller.signal,
    });
    const data = await response.json();
    if (!Array.isArray(data) || !data.length) {
      return null;
    }
    const lat = Number.parseFloat(data[0].lat);
    const lng = Number.parseFloat(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    const cache = await prisma.geocodingCache.create({
      data: { address: normalized, lat, lng, provider: "nominatim" },
    });
    return { lat: cache.lat, lng: cache.lng, provider: cache.provider };
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = { geocodeAddress, extractCoordinatesFromUrl };
