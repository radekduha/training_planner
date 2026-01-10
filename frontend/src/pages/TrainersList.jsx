import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchTrainers } from "../api/trainers.js";
import PageHeader from "../components/PageHeader.jsx";

const TrainersList = () => {
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTrainers()
      .then((data) => {
        setTrainers(data.items || []);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="stack">
      <PageHeader
        title="Trainers"
        subtitle="Roster of available trainers."
        actions={
          <Link className="btn btn-primary" to="/trainers/new">
            Add trainer
          </Link>
        }
      />
      <div className="card">
        {loading ? (
          <p className="muted">Loading trainers...</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : trainers.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Hourly rate</th>
                  <th>Travel rate</th>
                </tr>
              </thead>
              <tbody>
                {trainers.map((trainer) => (
                  <tr key={trainer.id}>
                    <td>
                      <Link className="text-link" to={`/trainers/${trainer.id}`}>
                        {trainer.name}
                      </Link>
                    </td>
                    <td>{trainer.email || "--"}</td>
                    <td>{trainer.hourly_rate ?? "--"}</td>
                    <td>{trainer.travel_rate_km ?? "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div>
              <h3>No trainers yet</h3>
              <p>Add trainers to start getting recommendations.</p>
            </div>
            <Link className="btn" to="/trainers/new">
              Create trainer
            </Link>
          </div>
        )}
      </div>
    </section>
  );
};

export default TrainersList;
