const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const durationMinutesForType = (trainingType) => {
  if (!trainingType) {
    return 240;
  }
  if (Number.isInteger(trainingType.durationMinutes) && trainingType.durationMinutes > 0) {
    return trainingType.durationMinutes;
  }
  if (typeof trainingType.teachingHours === "number" && trainingType.teachingHours > 0) {
    return Math.round(trainingType.teachingHours * 60);
  }
  return 240;
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

const countDistinctDates = (datetimes = []) => {
  const days = new Set();
  datetimes.forEach((value) => {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      return;
    }
    days.add(value.toISOString().slice(0, 10));
  });
  return days.size;
};

const monthRangeForDate = (value) => {
  const date = value instanceof Date ? value : new Date();
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
};

const toShare = (part, total) => {
  if (!total) {
    return 0;
  }
  return part / total;
};

const computeFairness = ({
  trainerId,
  slotStart,
  offeredDatesByTrainer,
  deliveredDatesByTrainer,
  eligibleTrainerIds,
}) => {
  const month = monthRangeForDate(slotStart);
  const eligible = Array.from(new Set(eligibleTrainerIds));

  const offeredByTrainer = {};
  const deliveredByTrainer = {};

  eligible.forEach((id) => {
    const offered = (offeredDatesByTrainer[id] || []).filter(
      (date) => date >= month.start && date <= month.end
    );
    const delivered = (deliveredDatesByTrainer[id] || []).filter(
      (date) => date >= month.start && date <= month.end
    );
    offeredByTrainer[id] = countDistinctDates(offered);
    deliveredByTrainer[id] = countDistinctDates(delivered);
  });

  const totalOffered = Object.values(offeredByTrainer).reduce((sum, value) => sum + value, 0);
  const totalDelivered = Object.values(deliveredByTrainer).reduce((sum, value) => sum + value, 0);

  const offeredDays = offeredByTrainer[trainerId] || 0;
  const deliveredDays = deliveredByTrainer[trainerId] || 0;
  const targetShare = toShare(offeredDays, totalOffered);
  const actualShare = toShare(deliveredDays, totalDelivered);

  const gap = actualShare - targetShare;
  const toleranceRatio = 0.2;
  const deviationRatio = targetShare > 0 ? Math.abs(gap) / targetShare : actualShare > 0 ? 1 : 0;
  const withinTolerance = deviationRatio <= toleranceRatio;

  return {
    offeredDays,
    deliveredDays,
    targetShare,
    actualShare,
    gap,
    deviationRatio,
    withinTolerance,
  };
};

const scoreCandidate = ({ fairness, slotStart, windowStart, windowEnd }) => {
  const windowDuration = Math.max(1, windowEnd.getTime() - windowStart.getTime());
  const slotProgress = clamp((slotStart.getTime() - windowStart.getTime()) / windowDuration, 0, 1);
  const slotFitScore = 100 * (1 - slotProgress);

  const fairnessDeficit = fairness.targetShare - fairness.actualShare;
  const fairnessScore = clamp(50 + fairnessDeficit * 220, 0, 100);

  return clamp(0.75 * fairnessScore + 0.25 * slotFitScore, 0, 100);
};

const buildFairnessReason = (fairness) => {
  const targetPercent = Math.round(fairness.targetShare * 1000) / 10;
  const actualPercent = Math.round(fairness.actualShare * 1000) / 10;
  const delta = Math.round((fairness.targetShare - fairness.actualShare) * 1000) / 10;
  if (delta > 0) {
    return `Pod cílovým podílem o ${delta} p. b. (cíl ${targetPercent} %, skutečnost ${actualPercent} %).`;
  }
  if (delta < 0) {
    return `Nad cílovým podílem o ${Math.abs(delta)} p. b. (cíl ${targetPercent} %, skutečnost ${actualPercent} %).`;
  }
  return `Na cílovém podílu ${targetPercent} %.`;
};

const recommendTrainerSlots = ({
  training,
  trainers,
  slots,
  deliveredDatesByTrainer,
}) => {
  if (!training || !training.trainingType) {
    return [];
  }

  const windowStart = training.requestWindowStart || training.startDatetime;
  const windowEnd = training.requestWindowEnd || training.endDatetime;
  if (!(windowStart instanceof Date) || !(windowEnd instanceof Date)) {
    return [];
  }

  const requiredMinutes = durationMinutesForType(training.trainingType);
  const requiredMs = requiredMinutes * 60000;

  const eligibleTrainerIds = [];
  const trainerById = {};

  trainers.forEach((trainer) => {
    trainerById[trainer.id] = trainer;
    const skillIds = new Set((trainer.skills || []).map((skill) => skill.trainingTypeId));
    if (skillIds.has(training.trainingTypeId)) {
      eligibleTrainerIds.push(trainer.id);
    }
  });

  const offeredDatesByTrainer = {};
  slots.forEach((slot) => {
    if (!slot.isActive) {
      return;
    }
    if (!offeredDatesByTrainer[slot.trainerId]) {
      offeredDatesByTrainer[slot.trainerId] = [];
    }
    offeredDatesByTrainer[slot.trainerId].push(slot.startDatetime);
  });

  const matches = [];
  const seenTrainerSlot = new Set();

  slots.forEach((slot) => {
    const trainer = trainerById[slot.trainerId];
    if (!trainer) {
      return;
    }

    const skillIds = new Set((trainer.skills || []).map((skill) => skill.trainingTypeId));
    if (!skillIds.has(training.trainingTypeId)) {
      return;
    }
    if (!slot.isActive || slot.assignedTrainingId) {
      return;
    }

    const durationMs = slot.endDatetime.getTime() - slot.startDatetime.getTime();
    if (durationMs < requiredMs) {
      return;
    }
    if (slot.startDatetime < windowStart || slot.endDatetime > windowEnd) {
      return;
    }

    const signature = `${trainer.id}-${slot.id}`;
    if (seenTrainerSlot.has(signature)) {
      return;
    }
    seenTrainerSlot.add(signature);

    const fairness = computeFairness({
      trainerId: trainer.id,
      slotStart: slot.startDatetime,
      offeredDatesByTrainer,
      deliveredDatesByTrainer,
      eligibleTrainerIds,
    });
    const matchPercent = scoreCandidate({
      fairness,
      slotStart: slot.startDatetime,
      windowStart,
      windowEnd,
    });
    const reasons = [
      "Trenér má dovednost pro zvolené téma.",
      "Slot splňuje požadovanou délku i časové okno.",
      buildFairnessReason(fairness),
    ];

    matches.push({
      trainer,
      slot,
      matchPercent,
      reasons,
      fairness,
    });
  });

  matches.sort((a, b) => {
    if (b.matchPercent !== a.matchPercent) {
      return b.matchPercent - a.matchPercent;
    }
    return a.slot.startDatetime.getTime() - b.slot.startDatetime.getTime();
  });

  return matches.slice(0, 50);
};

module.exports = {
  durationMinutesForType,
  monthRangeForDate,
  parseRuleValue,
  recommendTrainerSlots,
};
