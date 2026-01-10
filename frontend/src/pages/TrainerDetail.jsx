import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { fetchTrainer } from "../api/trainers.js";
import PageHeader from "../components/PageHeader.jsx";

const weekdayLabels = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const weekdayOptions = weekdayLabels.map((label, value) => ({ value, label }));

const formatCzk = (value) => {
  if (value === null || value === undefined || value === "") {
    return "--";
  }
  return `${value} Kč`;
};

const formatCzkPerKm = (value) => {
  if (value === null || value === undefined || value === "") {
    return "--";
  }
  return `${value} Kč / km`;
};

const normalizeWeekdayValues = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized = value
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return Array.from(new Set(normalized)).sort((a, b) => a - b);
};

const formatRuleValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return "--";
  }
  return String(value);
};

const getRuleDisplay = (rule) => {
  if (rule.type === "max_distance_km") {
    return { label: "Max distance", value: rule.value, unit: "km" };
  }
  if (rule.type === "max_long_trips_per_month") {
    return { label: "Max long trips per month", value: rule.value, unit: "trips" };
  }
  return { label: rule.label, value: rule.value, unit: "" };
};

const renderRuleMetric = (rule) => {
  const { label, value, unit } = getRuleDisplay(rule);
  const displayValue = formatRuleValue(value);
  const showUnit = unit && displayValue !== "--";
  return (
    <div className="rule-metric">
      <span className="rule-label">{label}</span>
      <span className="rule-value">
        {displayValue}
        {showUnit ? <span className="rule-unit">{unit}</span> : null}
      </span>
    </div>
  );
};

const normalizeWeekendAllowed = (value) => {
  if (value === true || value === "true") {
    return true;
  }
  if (value === false || value === "false") {
    return false;
  }
  return null;
};

const TrainerDetail = () => {
  const { id } = useParams();
  const [trainer, setTrainer] = useState(null);
  const [assignedTrainings, setAssignedTrainings] = useState([]);
  const [workload, setWorkload] = useState({ month_workload: 0, month_long_trips: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetchTrainer(id)
      .then((data) => {
        setTrainer(data.item);
        setAssignedTrainings(data.assigned_trainings || []);
        setWorkload({
          month_workload: data.month_workload || 0,
          month_long_trips: data.month_long_trips || 0,
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <section className="stack">
        <p className="muted">Loading trainer...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="stack">
        <div className="card">
          <h2>Trainer detail</h2>
          <p className="error">{error}</p>
          <Link className="btn" to="/trainers">
            Back to trainers
          </Link>
        </div>
      </section>
    );
  }

  if (!trainer) {
    return null;
  }

  const preferredWeekdaysRule = trainer.rules?.find(
    (rule) => rule.type === "preferred_weekdays"
  );
  const preferredWeekdays = normalizeWeekdayValues(preferredWeekdaysRule?.value);
  const preferredWeekdaysSet = new Set(preferredWeekdays);
  const weekendAllowedRule = trainer.rules?.find((rule) => rule.type === "weekend_allowed");
  const weekendAllowed = normalizeWeekendAllowed(weekendAllowedRule?.value);
  const otherRules =
    trainer.rules?.filter(
      (rule) => rule.type !== "preferred_weekdays" && rule.type !== "weekend_allowed"
    ) || [];
  const weekendLabel =
    weekendAllowed === null ? "--" : weekendAllowed ? "Allowed" : "Not allowed";
  const weekendClass =
    weekendAllowed === null
      ? "status-pill"
      : weekendAllowed
        ? "status-pill positive"
        : "status-pill negative";
  const ruleSections = [
    {
      key: "weekend",
      content: (
        <div className="rule-status">
          <span className="detail-label">Weekend allowed</span>
          <span className={weekendClass}>{weekendLabel}</span>
        </div>
      ),
    },
    {
      key: "weekdays",
      content: (
        <>
          <p className="detail-label">Preferred weekdays</p>
          <div className="weekday-grid compact">
            {weekdayOptions.map((day) => {
              const isPreferred = preferredWeekdaysSet.has(day.value);
              return (
                <div
                  key={day.value}
                  className={`weekday-item${isPreferred ? " active" : ""}`}
                >
                  <span className="weekday-check" aria-hidden="true">
                    {isPreferred ? "✓" : ""}
                  </span>
                  <span>{day.label}</span>
                </div>
              );
            })}
          </div>
        </>
      ),
    },
    ...otherRules.map((rule) => ({
      key: rule.type,
      content: renderRuleMetric(rule),
    })),
  ];

  return (
    <section className="stack trainer-detail">
      <PageHeader
        title={trainer.name}
        subtitle="Trainer profile and current workload."
        actions={
          <Link className="btn btn-ghost" to={`/trainers/${trainer.id}/edit`}>
            Edit trainer
          </Link>
        }
      />
      <div className="grid two">
        <div className="stack">
          <div className="card">
            <h3>Contact</h3>
            <div className="detail-list">
              <div className="detail-item">
                <span className="detail-label">Email</span>
                <strong className="detail-value">{trainer.email || "--"}</strong>
              </div>
              <div className="detail-divider" role="presentation" />
              <div className="detail-item">
                <span className="detail-label">Phone</span>
                <strong className="detail-value">{trainer.phone || "--"}</strong>
              </div>
              <div className="detail-divider" role="presentation" />
              <div className="detail-item">
                <span className="detail-label">Home</span>
                <strong className="detail-value">{trainer.home_address}</strong>
              </div>
            </div>
          </div>
          <div className="card">
            <h3>Pricing</h3>
            <div className="detail-list two-column">
              <div className="detail-item">
                <span className="detail-label">Hourly rate</span>
                <strong className="detail-value">{formatCzk(trainer.hourly_rate)}</strong>
              </div>
              <div className="detail-divider" role="presentation" />
              <div className="detail-item">
                <span className="detail-label">Travel rate</span>
                <strong className="detail-value">
                  {formatCzkPerKm(trainer.travel_rate_km)}
                </strong>
              </div>
            </div>
          </div>
          <div className="card">
            <h3>Notes &amp; workload</h3>
            <div className="detail-list">
              <div className="detail-item">
                <span className="detail-label">Notes</span>
                <strong className="detail-value">{trainer.notes || "--"}</strong>
              </div>
              <div className="detail-divider" role="presentation" />
              <div className="detail-item">
                <span className="detail-label">Workload this month</span>
                <strong className="detail-value">
                  {workload.month_workload} trainings, {workload.month_long_trips} long trips
                </strong>
              </div>
            </div>
          </div>
          <div className="card">
            <h3>Training types</h3>
            <div className="pill-row">
              {trainer.training_types?.length ? (
                trainer.training_types.map((type) => (
                  <span className="pill" key={type.id}>
                    {type.name}
                  </span>
                ))
              ) : (
                <p className="muted">No training types assigned.</p>
              )}
            </div>
          </div>
          <div className="card">
            <h3>Rules</h3>
            <div className="rules-stack">
              {ruleSections.map((section, index) => (
                <div key={section.key} className="rule-section">
                  {section.content}
                  {index < ruleSections.length - 1 ? (
                    <div className="rule-divider" role="presentation" />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <h3>Assigned trainings</h3>
          {assignedTrainings.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Training</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedTrainings.map((training) => (
                    <tr key={training.id}>
                      <td>
                        <Link className="text-link" to={`/trainings/${training.id}`}>
                          {training.training_type?.name}
                        </Link>
                      </td>
                      <td>{new Date(training.start_datetime).toLocaleString()}</td>
                      <td>
                        <span className="pill">{training.status_label}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No trainings assigned yet.</p>
          )}
        </div>
      </div>
    </section>
  );
};

export default TrainerDetail;
