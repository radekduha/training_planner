const TRAINING_STATUS_LABELS = {
  draft: "Koncept",
  open: "Otevřené",
  assigned: "Přiřazeno",
  confirmed: "Potvrzeno",
  canceled: "Zrušeno",
};

const statusChoices = () =>
  Object.entries(TRAINING_STATUS_LABELS).map(([value, label]) => ({ value, label }));

const statusLabel = (value) => TRAINING_STATUS_LABELS[value] || value || "";

const isoOrNull = (value) =>
  value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : null;

const trainingTypePayload = (trainingType) => ({
  id: trainingType.id,
  name: trainingType.name,
  duration_minutes: trainingType.durationMinutes ?? 240,
  teaching_hours: trainingType.teachingHours ?? null,
  max_participants: trainingType.maxParticipants ?? null,
});

const trainerFullName = (trainer) => {
  const parts = [trainer.firstName, trainer.lastName]
    .map((part) => (part || "").trim())
    .filter(Boolean);
  return parts.join(" ").trim();
};

const trainerDisplayName = (trainer) => {
  const fullName = trainerFullName(trainer);
  const parts = [trainer.titlePrefix, fullName, trainer.titleSuffix]
    .map((part) => (part || "").trim())
    .filter(Boolean);
  return parts.join(" ") || fullName || trainer.firstName || trainer.lastName || "";
};

const trainerSummary = (trainer) => ({
  id: trainer.id,
  name: trainerFullName(trainer),
  display_name: trainerDisplayName(trainer),
});

const availabilitySlotPayload = (slot) => ({
  id: slot.id,
  start_datetime: isoOrNull(slot.startDatetime),
  end_datetime: isoOrNull(slot.endDatetime),
  is_active: slot.isActive,
  assigned_training_id: slot.assignedTrainingId ?? null,
});

const trainerPayload = (trainer, detail = false) => {
  const payload = {
    id: trainer.id,
    name: trainerFullName(trainer),
    first_name: trainer.firstName || "",
    last_name: trainer.lastName || "",
    title_prefix: trainer.titlePrefix || "",
    title_suffix: trainer.titleSuffix || "",
    display_name: trainerDisplayName(trainer),
    akris: trainer.akris,
    call_before_training: trainer.callBeforeTraining,
    frequency_quantity: trainer.frequencyQuantity || "",
    frequency_period: trainer.frequencyPeriod || "",
    limit_note: trainer.limitNote || "",
    email: trainer.email || "",
    phone: trainer.phone || "",
    home_address: trainer.homeAddress,
    home_lat: trainer.homeLat,
    home_lng: trainer.homeLng,
    hourly_rate: trainer.hourlyRate,
    travel_rate_km: trainer.travelRateKm,
    notes: trainer.notes || "",
    created_at: isoOrNull(trainer.createdAt),
    updated_at: isoOrNull(trainer.updatedAt),
  };

  if (detail) {
    payload.training_types = (trainer.skills || []).map((skill) =>
      trainingTypePayload(skill.trainingType)
    );
    payload.availability_slots = (trainer.availabilitySlots || [])
      .slice()
      .sort((a, b) => a.startDatetime.getTime() - b.startDatetime.getTime())
      .map(availabilitySlotPayload);
  }

  return payload;
};

const trainingListItem = (training) => ({
  id: training.id,
  training_type: trainingTypePayload(training.trainingType),
  customer_name: training.customerName || "",
  address: training.address,
  request_window_start: isoOrNull(training.requestWindowStart || training.startDatetime),
  request_window_end: isoOrNull(training.requestWindowEnd || training.endDatetime),
  assigned_start_datetime: training.assignedTrainerId ? isoOrNull(training.startDatetime) : null,
  assigned_end_datetime: training.assignedTrainerId ? isoOrNull(training.endDatetime) : null,
  status: training.status,
  status_label: statusLabel(training.status),
  assigned_trainer: training.assignedTrainer ? trainerSummary(training.assignedTrainer) : null,
  created_at: isoOrNull(training.createdAt),
  updated_at: isoOrNull(training.updatedAt),
});

const trainingPayload = (training, assignedSlot = null) => {
  const payload = trainingListItem(training);
  payload.lat = training.lat;
  payload.lng = training.lng;
  payload.assignment_reason = training.assignmentReason || "";
  payload.notes = training.notes || "";
  payload.changed_by = training.changedBy || "";
  payload.assigned_slot = assignedSlot ? availabilitySlotPayload(assignedSlot) : null;
  return payload;
};

const fairnessPayload = (fairness) => ({
  offered_days: fairness.offeredDays,
  delivered_days: fairness.deliveredDays,
  target_share: fairness.targetShare,
  actual_share: fairness.actualShare,
  deviation_ratio: fairness.deviationRatio,
  within_tolerance: fairness.withinTolerance,
});

module.exports = {
  availabilitySlotPayload,
  fairnessPayload,
  statusChoices,
  statusLabel,
  trainerPayload,
  trainerSummary,
  trainingListItem,
  trainingPayload,
  trainingTypePayload,
};
