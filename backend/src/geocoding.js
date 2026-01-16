const { prisma } = require("./db");
const config = require("./env");

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

module.exports = { geocodeAddress };
