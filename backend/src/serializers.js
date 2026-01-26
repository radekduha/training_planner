const TRAINING_STATUS_LABELS = {
  draft: "Koncept",
  waiting: "Čeká na trenéra",
  assigned: "Přiřazeno",
  confirmed: "Potvrzeno",
  canceled: "Zrušeno",
};

const TRAINER_RULE_LABELS = {
  max_distance_km: "Maximální vzdálenost (km)",
  weekend_allowed: "Víkendy povoleny",
  max_long_trips_per_month: "Maximální počet dlouhých cest za měsíc",
  preferred_weekdays: "Preferované dny v týdnu",
};

const statusChoices = () =>
  Object.entries(TRAINING_STATUS_LABELS).map(([value, label]) => ({ value, label }));

const statusLabel = (value) => TRAINING_STATUS_LABELS[value] || value || "";

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

const trainingTypePayload = (trainingType) => ({
  id: trainingType.id,
  name: trainingType.name,
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

const trainerPayload = (trainer, detail = false) => {
  const fullName = trainerFullName(trainer);
  const payload = {
    id: trainer.id,
    name: fullName,
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
  };
  if (detail) {
    payload.training_types = (trainer.skills || []).map((skill) =>
      trainingTypePayload(skill.trainingType)
    );
    payload.rules = (trainer.rules || []).map((rule) => ({
      type: rule.ruleType,
      label: TRAINER_RULE_LABELS[rule.ruleType] || rule.ruleType,
      value: parseRuleValue(rule.ruleValue),
    }));
  }
  return payload;
};

const trainingListItem = (training) => {
  const assignedTrainer = training.assignedTrainer
    ? trainerSummary(training.assignedTrainer)
    : null;
  return {
    id: training.id,
    training_type: trainingTypePayload(training.trainingType),
    customer_name: training.customerName || "",
    address: training.address,
    start_datetime: training.startDatetime.toISOString(),
    end_datetime: training.endDatetime.toISOString(),
    status: training.status,
    status_label: statusLabel(training.status),
    assigned_trainer: assignedTrainer,
  };
};

const trainingPayload = (training) => {
  const payload = trainingListItem(training);
  payload.lat = training.lat;
  payload.lng = training.lng;
  payload.assignment_reason = training.assignmentReason || "";
  payload.notes = training.notes || "";
  payload.google_event_id = training.googleEventId || "";
  payload.visitors = training.visitors ?? null;
  payload.accreditation = training.accreditation ?? null;
  payload.hours = training.hours ?? null;
  payload.trainers_fee = training.trainersFee ?? null;
  payload.price_w_vat = training.priceWithVat ?? null;
  payload.payer_address = training.payerAddress || "";
  payload.payer_id = training.payerId || "";
  payload.invoice_number = training.invoiceNumber || "";
  payload.training_place = training.trainingPlace || "";
  payload.contact_name = training.contactName || "";
  payload.contact_phone = training.contactPhone || "";
  payload.invoice_email = training.invoiceEmail || "";
  payload.email_for_approval = training.approvalEmail || "";
  payload.study_materials = training.studyMaterials || "";
  payload.info_for_the_trainer = training.infoForTheTrainer || "";
  payload.pp = training.pp || "";
  payload.d = training.d || "";
  return payload;
};

module.exports = {
  statusChoices,
  statusLabel,
  trainingListItem,
  trainingPayload,
  trainingTypePayload,
  trainerPayload,
  trainerSummary,
};
