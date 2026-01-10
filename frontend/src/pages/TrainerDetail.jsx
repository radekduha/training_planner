import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { fetchTrainer } from "../api/trainers.js";
import PageHeader from "../components/PageHeader.jsx";

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

  return (
    <section className="stack">
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
        <div className="card">
          <div className="detail-list">
            <div>
              <span className="muted">Contact</span>
              <strong>
                {(trainer.email || "--") + (trainer.phone ? ` / ${trainer.phone}` : "")}
              </strong>
            </div>
            <div>
              <span className="muted">Home</span>
              <strong>{trainer.home_address}</strong>
            </div>
            <div>
              <span className="muted">Lat/Lng</span>
              <strong>
                {trainer.home_lat ?? "--"}, {trainer.home_lng ?? "--"}
              </strong>
            </div>
            <div>
              <span className="muted">Hourly rate</span>
              <strong>{trainer.hourly_rate ?? "--"}</strong>
            </div>
            <div>
              <span className="muted">Travel rate</span>
              <strong>{trainer.travel_rate_km ?? "--"}</strong>
            </div>
            <div>
              <span className="muted">Notes</span>
              <strong>{trainer.notes || "--"}</strong>
            </div>
            <div>
              <span className="muted">Workload this month</span>
              <strong>
                {workload.month_workload} trainings, {workload.month_long_trips} long trips
              </strong>
            </div>
          </div>
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
          <h3>Rules</h3>
          {trainer.rules?.length ? (
            <ul className="rule-list">
              {trainer.rules.map((rule) => (
                <li key={rule.type}>
                  <strong>{rule.label}:</strong> {String(rule.value)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No rules yet.</p>
          )}
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
