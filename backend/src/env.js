const path = require("path");
const dotenv = require("dotenv");

const rootEnv = path.resolve(__dirname, "..", "..", ".env");
const localEnv = path.resolve(__dirname, "..", ".env");

dotenv.config({ path: rootEnv });
dotenv.config({ path: localEnv });

const config = {
  port: Number(process.env.PORT || 3001),
  sessionSecret: process.env.SESSION_SECRET || "change-me",
  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "admin",
  geocodingProvider: process.env.GEOCODING_PROVIDER || "nominatim",
  geocodingUserAgent: process.env.GEOCODING_USER_AGENT || "training-planner-mvp",
  timeZone: process.env.TIME_ZONE || "Europe/Prague",
};

module.exports = config;
