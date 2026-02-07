import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { fetchTrainer } from "../api/trainers.js";
import PageHeader from "../components/PageHeader.jsx";
import useRealtimeInvalidate from "../hooks/useRealtimeInvalidate.js";

const formatDateTime = (value) => {
  if (!value) {
    return "--";
  }
  return new Date(value).toLocaleString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const percent = (value) => `${Math.round((value || 0) * 1000) / 10} %`;

const TrainerDetail = () => {
  const { id } = useParams();
  const [trainer, setTrainer] = useState(null);
  const [assignedTrainings, setAssignedTrainings] = useState([]);
  const [fairness, setFairness] = useState({
    offered_days: 0,
    delivered_days: 0,
    target_share: 0,
    actual_share: 0,
    deviation_ratio: 0,
    within_tolerance: true,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadTrainer = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTrainer(id);
      setTrainer(data.item);
      setAssignedTrainings(data.assigned_trainings || []);
      setFairness(data.fairness_current_month || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadTrainer();
  }, [loadTrainer]);

  useRealtimeInvalidate(
    useCallback(() => {
      loadTrainer();
    }, [loadTrainer])
  );

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

  const displayName =
    trainer.display_name ||
    [trainer.title_prefix, trainer.first_name, trainer.last_name, trainer.title_suffix]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    trainer.name;

  return (
    <section className="stack trainer-detail">
      <PageHeader
        title={displayName}
        subtitle="Dovednosti, sloty dostupnosti a měsíční fairness."
        actions={
          <Link className="btn btn-ghost" to={`/trainers/${trainer.id}/edit`}>
            Upravit trenéra
          </Link>
        }
      />

      <div className="grid two">
        <div className="stack">
          <div className="card">
            <h3>Profil</h3>
            <div className="detail-list">
              <div>
                <span className="muted">E-mail</span>
                <strong>{trainer.email || "--"}</strong>
              </div>
              <div>
                <span className="muted">Telefon</span>
                <strong>{trainer.phone || "--"}</strong>
              </div>
              <div>
                <span className="muted">Adresa</span>
                <strong>{trainer.home_address || "--"}</strong>
              </div>
              <div>
                <span className="muted">Poznámky</span>
                <strong>{trainer.notes || "--"}</strong>
              </div>
            </div>
          </div>

          <div className="card">
            <h3>Témata</h3>
            <div className="pill-row">
              {trainer.training_types?.length ? (
                trainer.training_types.map((type) => (
                  <span className="pill" key={type.id}>
                    {type.name}
                  </span>
                ))
              ) : (
                <p className="muted">Žádné téma není přiřazené.</p>
              )}
            </div>
          </div>

          <div className="card">
            <h3>Fairness tento měsíc</h3>
            <div className="detail-list">
              <div>
                <span className="muted">Offered days</span>
                <strong>{fairness.offered_days ?? 0}</strong>
              </div>
              <div>
                <span className="muted">Delivered days</span>
                <strong>{fairness.delivered_days ?? 0}</strong>
              </div>
              <div>
                <span className="muted">Cílový podíl</span>
                <strong>{percent(fairness.target_share)}</strong>
              </div>
              <div>
                <span className="muted">Skutečný podíl</span>
                <strong>{percent(fairness.actual_share)}</strong>
              </div>
              <div>
                <span className="muted">Odchylka</span>
                <strong>{Math.round((fairness.deviation_ratio || 0) * 100)} %</strong>
              </div>
              <div>
                <span className="muted">Tolerance 20 %</span>
                <strong>{fairness.within_tolerance ? "V toleranci" : "Mimo toleranci"}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h3>Dostupné sloty</h3>
            {trainer.availability_slots?.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Od</th>
                      <th>Do</th>
                      <th>Stav</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainer.availability_slots.map((slot) => (
                      <tr key={slot.id}>
                        <td>{formatDateTime(slot.start_datetime)}</td>
                        <td>{formatDateTime(slot.end_datetime)}</td>
                        <td>
                          {slot.assigned_training_id
                            ? `Rezervováno (poptávka #${slot.assigned_training_id})`
                            : slot.is_active
                              ? "Volné"
                              : "Neaktivní"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">Zatím nejsou zadané žádné sloty.</p>
            )}
          </div>

          <div className="card">
            <h3>Přiřazené poptávky</h3>
            {assignedTrainings.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Poptávka</th>
                      <th>Termín</th>
                      <th>Stav</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignedTrainings.map((training) => (
                      <tr key={training.id}>
                        <td>
                          <Link className="text-link" to={`/trainings/${training.id}`}>
                            {training.training_type?.name || `Poptávka #${training.id}`}
                          </Link>
                        </td>
                        <td>{formatDateTime(training.assigned_start_datetime)}</td>
                        <td>
                          <span className="pill">{training.status_label}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">Zatím žádné přiřazené poptávky.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default TrainerDetail;
