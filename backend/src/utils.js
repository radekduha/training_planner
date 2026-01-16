const pad2 = (value) => String(value).padStart(2, "0");

const formatDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const formatTime = (date, timeZone) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  });
  return formatter.format(date);
};

const parseDateOnly = (value) => {
  if (!value) {
    return null;
  }
  const parsed = new Date(`${value}T00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  parsed.setSeconds(0, 0);
  return parsed;
};

const parseDateTime = (value) => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

const startOfDay = (date) => {
  if (!date) {
    return null;
  }
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

const endOfDay = (date) => {
  if (!date) {
    return null;
  }
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
};

const addError = (errors, field, message) => {
  if (!errors[field]) {
    errors[field] = [];
  }
  errors[field].push({ message });
};

const hasErrors = (errors) => Object.keys(errors).length > 0;

const toInt = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return parsed;
};

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return parsed;
};

const startOfWeekMonday = (date) => {
  const result = new Date(date);
  const day = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - day);
  result.setHours(0, 0, 0, 0);
  return result;
};

module.exports = {
  addError,
  endOfDay,
  formatDate,
  formatTime,
  hasErrors,
  parseDateOnly,
  parseDateTime,
  startOfDay,
  startOfWeekMonday,
  toInt,
  toNumber,
};
