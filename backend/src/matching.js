const LONG_TRIP_THRESHOLD_KM = 150.0;

const isWeekend = (date) => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

const haversineKm = (lat1, lng1, lat2, lng2) => {
  const radiusKm = 6371.0;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radiusKm * c;
};

const parseRuleValue = (ruleValue) => {
  if (!ruleValue) {
    return null;
  }
  try {
    const parsed = JSON.parse(ruleValue);
    return parsed && Object.prototype.hasOwnProperty.call(parsed, "value")
      ? parsed.value
      : null;
  } catch (err) {
    return null;
  }
};

const ruleValue = (trainer, ruleType) => {
  const rules = trainer.rules || [];
  for (const rule of rules) {
    if (rule.ruleType === ruleType) {
      return parseRuleValue(rule.ruleValue);
    }
  }
  return null;
};

const hasConflict = (training, existing) => {
  for (const other of existing) {
    if (other.id === training.id) {
      continue;
    }
    if (training.startDatetime < other.endDatetime && training.endDatetime > other.startDatetime) {
      return true;
    }
  }
  return false;
};

const trainingsInMonth = (training, existing) => {
  return existing.filter(
    (item) =>
      item.startDatetime.getFullYear() === training.startDatetime.getFullYear() &&
      item.startDatetime.getMonth() === training.startDatetime.getMonth()
  );
};

const trainingHours = (training) => {
  const durationMs = training.endDatetime - training.startDatetime;
  return Math.max(0, durationMs / 3600000);
};

const estimatedCost = (trainer, distanceKm, training) => {
  const hourlyRate = trainer.hourlyRate ?? null;
  const travelRate = trainer.travelRateKm ?? null;
  if (hourlyRate === null && travelRate === null) {
    return null;
  }
  let total = 0;
  if (hourlyRate !== null) {
    total += hourlyRate * trainingHours(training);
  }
  if (travelRate !== null) {
    total += travelRate * distanceKm;
  }
  return total;
};

const longTripCount = (trainer, training, existing, thresholdKm) => {
  if (trainer.homeLat === null || trainer.homeLng === null) {
    return 0;
  }
  let trips = 0;
  for (const item of trainingsInMonth(training, existing)) {
    if (item.lat === null || item.lng === null) {
      continue;
    }
    const distance = haversineKm(item.lat, item.lng, trainer.homeLat, trainer.homeLng);
    if (distance > thresholdKm) {
      trips += 1;
    }
  }
  return trips;
};

const recommendTrainers = (training, trainers, existingTrainings) => {
  if (training.lat === null || training.lng === null) {
    return { matches: [], usedCompromise: false };
  }

  const trainingsByTrainer = {};
  for (const existing of existingTrainings) {
    if (!existing.assignedTrainerId) {
      continue;
    }
    if (!trainingsByTrainer[existing.assignedTrainerId]) {
      trainingsByTrainer[existing.assignedTrainerId] = [];
    }
    trainingsByTrainer[existing.assignedTrainerId].push(existing);
  }

  const matches = [];
  const compromises = [];

  for (const trainer of trainers) {
    if (trainer.homeLat === null || trainer.homeLng === null) {
      continue;
    }
    const distance = haversineKm(
      training.lat,
      training.lng,
      trainer.homeLat,
      trainer.homeLng
    );
    const ruleFailures = [];
    const softWarnings = [];

    const skillIds = new Set((trainer.skills || []).map((skill) => skill.trainingTypeId));
    if (!skillIds.has(training.trainingTypeId)) {
      ruleFailures.push("Does not teach this training type");
    }

    const maxDistance = ruleValue(trainer, "max_distance_km");
    if (maxDistance && distance > maxDistance) {
      ruleFailures.push(`Over max distance (${maxDistance} km)`);
    }

    const weekendAllowed = ruleValue(trainer, "weekend_allowed");
    if (weekendAllowed === false && isWeekend(training.startDatetime)) {
      ruleFailures.push("No weekend availability");
    }

    const assignedTrainings = trainingsByTrainer[trainer.id] || [];
    if (hasConflict(training, assignedTrainings)) {
      ruleFailures.push("Time conflict");
    }

    const maxLongTrips = ruleValue(trainer, "max_long_trips_per_month");
    const longTrips = longTripCount(trainer, training, assignedTrainings, LONG_TRIP_THRESHOLD_KM);
    if (maxLongTrips !== null && distance > LONG_TRIP_THRESHOLD_KM) {
      if (longTrips >= maxLongTrips) {
        ruleFailures.push("Long trip limit reached");
      }
    }

    const monthlyWorkload = trainingsInMonth(training, assignedTrainings).length;
    const totalWorkload = monthlyWorkload + longTrips;
    const estCost = estimatedCost(trainer, distance, training);

    let score = Math.max(0, 800.0 - distance * 4.0);
    score += Math.max(0, 20 - monthlyWorkload) * 6.0;
    if (estCost !== null) {
      score += Math.max(0, 4000.0 - estCost) * 0.04;
    }
    score -= longTrips * 3.0;

    const preferredWeekdays = ruleValue(trainer, "preferred_weekdays") || [];
    if (preferredWeekdays.length) {
      const weekday = (training.startDatetime.getDay() + 6) % 7;
      if (!preferredWeekdays.includes(weekday)) {
        score -= 15.0;
        softWarnings.push("Outside preferred weekdays");
      }
    }

    const reasons = [
      `Distance ${distance.toFixed(1)} km`,
      `Workload ${totalWorkload} (trainings ${monthlyWorkload}, long trips ${longTrips})`,
    ];
    if (estCost !== null) {
      reasons.push(`Estimated cost ${Math.round(estCost)} CZK`);
    }

    const match = {
      trainer,
      score,
      estimatedCost: estCost,
      reasons,
      warnings: [...ruleFailures, ...softWarnings],
    };

    if (!ruleFailures.length) {
      matches.push(match);
    } else if (ruleFailures.length === 1) {
      compromises.push(match);
    }
  }

  const sortedMatches = matches.sort((a, b) => b.score - a.score);
  if (sortedMatches.length) {
    return { matches: sortedMatches, usedCompromise: false };
  }
  return {
    matches: compromises.sort((a, b) => b.score - a.score),
    usedCompromise: true,
  };
};

module.exports = {
  LONG_TRIP_THRESHOLD_KM,
  haversineKm,
  recommendTrainers,
};
