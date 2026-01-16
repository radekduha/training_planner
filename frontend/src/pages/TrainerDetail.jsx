import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { fetchTrainer } from "../api/trainers.js";
import PageHeader from "../components/PageHeader.jsx";

const weekdayLabels = [
  "Pondělí",
  "Úterý",
  "Středa",
  "Čtvrtek",
  "Pátek",
  "Sobota",
  "Neděle",
];
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
    return { label: "Maximální vzdálenost", value: rule.value, unit: "km" };
  }
  if (rule.type === "max_long_trips_per_month") {
    return { label: "Max. počet dlouhých cest za měsíc", value: rule.value, unit: "cest" };
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
        <p className="muted">Načítání trenéra...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="stack">
        <div className="card">
          <h2>Detail trenéra</h2>
          <p className="error">{error}</p>
          <Link className="btn" to="/trainers">
            Zpět na trenéry
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
    weekendAllowed === null ? "--" : weekendAllowed ? "Povoleno" : "Nepovoleno";
  const weekendClass =
    weekendAllowed === null
      ? "status-pill"
      : weekendAllowed
        ? "status-pill positive"
        : "status-pill negative";
  const displayName =
    trainer.display_name ||
    [trainer.title_prefix, trainer.first_name, trainer.last_name, trainer.title_suffix]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    trainer.name;
  const ruleSections = [
    {
      key: "weekend",
      content: (
        <div className="rule-status">
          <span className="detail-label">Víkendy povoleny</span>
          <span className={weekendClass}>{weekendLabel}</span>
        </div>
      ),
    },
    {
      key: "weekdays",
      content: (
        <>
          <p className="detail-label">Preferované dny v týdnu</p>
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
        title={displayName}
        subtitle="Profil trenéra a aktuální vytížení."
        actions={
          <Link className="btn btn-ghost" to={`/trainers/${trainer.id}/edit`}>
            Upravit trenéra
          </Link>
        }
      />
      <div className="grid trainer-detail-grid">
        <div className="stack">
          <div className="card">
            <h3>Profil</h3>
            <div className="detail-list">
              <div className="detail-item">
                <span className="detail-label">Jméno</span>
                <strong className="detail-value">{trainer.first_name || "--"}</strong>
              </div>
              <div className="detail-divider" role="presentation" />
              <div className="detail-item">
                <span className="detail-label">Příjmení</span>
                <strong className="detail-value">{trainer.last_name || "--"}</strong>
              </div>
              <div className="detail-divider" role="presentation" />
              <div className="detail-item">
                <span className="detail-label">Titul před jménem</span>
                <strong className="detail-value">{trainer.title_prefix || "--"}</strong>
              </div>
              <div className="detail-divider" role="presentation" />
              <div className="detail-item">
                <span className="detail-label">Titul za jménem</span>
                <strong className="detail-value">{trainer.title_suffix || "--"}</strong>
              </div>
              <div className="detail-divider" role="presentation" />
              <div className="detail-item">
                <span className="detail-label">AKRIS</span>
                <strong className="detail-value">{trainer.akris ? "Ano" : "Ne"}</strong>
              </div>
              <div className="detail-divider" role="presentation" />
              <div className="detail-item">
                <span className="detail-label">Zavolat před tréninkem</span>
                <strong className="detail-value">
                  {trainer.call_before_training ? "Ano" : "Ne"}
                </strong>
              </div>
              <div className="detail-divider" role="presentation" />
              <div className="detail-item">
                <span className="detail-label">Frekvence - hodnota</span>
                <strong className="detail-value">{trainer.frequency_quantity || "--"}</strong>
              </div>
              <div className="detail-divider" role="presentation" />
              <div className="detail-item">
                <span className="detail-label">Frekvence - jednotka</span>
                <strong className="detail-value">{trainer.frequency_period || "--"}</strong>
              </div>
              <div className="detail-divider" role="presentation" />
              <div className="detail-item">
                <span className="detail-label">E-mail</span>
                <strong className="detail-value">{trainer.email || "--"}</strong>
              </div>
              <div className="detail-divider" role="presentation" />
              <div className="detail-item">
                <span className="detail-label">Telefon</span>
                <strong className="detail-value">{trainer.phone || "--"}</strong>
              </div>
              <div className="detail-divider" role="presentation" />
              <div className="detail-item">
                <span className="detail-label">Bydliště</span>
                <strong className="detail-value">{trainer.home_address}</strong>
              </div>
            </div>
          </div>
          <div className="card">
            <h3>Ceník</h3>
            <div className="detail-list two-column">
              <div className="detail-item">
                <span className="detail-label">Hodinová sazba</span>
                <strong className="detail-value">{formatCzk(trainer.hourly_rate)}</strong>
              </div>
              <div className="detail-divider" role="presentation" />
              <div className="detail-item">
                <span className="detail-label">Cestovné</span>
                <strong className="detail-value">
                  {formatCzkPerKm(trainer.travel_rate_km)}
                </strong>
              </div>
            </div>
          </div>
          <div className="card">
            <h3>Poznámky a vytížení</h3>
            <div className="detail-list">
              <div className="detail-item">
                <span className="detail-label">Poznámka k limitu</span>
                <strong className="detail-value">{trainer.limit_note || "--"}</strong>
              </div>
              <div className="detail-divider" role="presentation" />
              <div className="detail-item">
                <span className="detail-label">Poznámky</span>
                <strong className="detail-value">{trainer.notes || "--"}</strong>
              </div>
              <div className="detail-divider" role="presentation" />
              <div className="detail-item">
                <span className="detail-label">Vytížení tento měsíc</span>
                <strong className="detail-value">
                  {workload.month_workload} tréninků, {workload.month_long_trips} dlouhých cest
                </strong>
              </div>
            </div>
          </div>
          <div className="card">
            <h3>Typy tréninků</h3>
            <div className="pill-row">
              {trainer.training_types?.length ? (
                trainer.training_types.map((type) => (
                  <span className="pill" key={type.id}>
                    {type.name}
                  </span>
                ))
              ) : (
                <p className="muted">Žádné typy tréninků nejsou přiřazeny.</p>
              )}
            </div>
          </div>
          <div className="card">
            <h3>Pravidla</h3>
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
          <h3>Přiřazené tréninky</h3>
          {assignedTrainings.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Trénink</th>
                    <th>Datum</th>
                    <th>Stav</th>
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
            <p className="muted">Zatím žádné přiřazené tréninky.</p>
          )}
        </div>
      </div>
    </section>
  );
};

export default TrainerDetail;
