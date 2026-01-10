import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchMeta } from "../api/meta.js";
import { fetchTrainings } from "../api/trainings.js";
import PageHeader from "../components/PageHeader.jsx";

const emptyFilters = {
  status: "",
  training_type: "",
  start_date: "",
  end_date: "",
  no_trainer: false,
};

const TrainingsList = () => {
  const [filters, setFilters] = useState(emptyFilters);
  const [meta, setMeta] = useState({ status_choices: [], training_types: [] });
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadTrainings = async (activeFilters) => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        ...activeFilters,
        no_trainer: activeFilters.no_trainer ? "1" : "",
      };
      const data = await fetchTrainings(payload);
      setTrainings(data.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeta()
      .then((data) => {
        setMeta({
          status_choices: data.status_choices || [],
          training_types: data.training_types || [],
        });
      })
      .catch(() => {});
    loadTrainings(emptyFilters);
  }, []);

  const onFilterChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFilters((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const onSubmit = (event) => {
    event.preventDefault();
    loadTrainings(filters);
  };

  const onReset = () => {
    setFilters(emptyFilters);
    loadTrainings(emptyFilters);
  };

  return (
    <section className="stack">
      <PageHeader
        title="Trainings"
        subtitle="Filter and review all scheduled trainings."
        actions={
          <Link className="btn btn-primary" to="/trainings/new">
            New training
          </Link>
        }
      />
      <div className="grid">
        <div className="card">
          <h2>Filters</h2>
          <form onSubmit={onSubmit} className="filters-form">
            <div className="filters">
              <div className="field">
                <label htmlFor="status">Status</label>
                <select id="status" name="status" value={filters.status} onChange={onFilterChange}>
                  <option value="">All</option>
                  {meta.status_choices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="training_type">Training type</label>
                <select
                  id="training_type"
                  name="training_type"
                  value={filters.training_type}
                  onChange={onFilterChange}
                >
                  <option value="">All</option>
                  {meta.training_types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="start_date">Start date</label>
                <input
                  id="start_date"
                  name="start_date"
                  type="date"
                  value={filters.start_date}
                  onChange={onFilterChange}
                />
              </div>
              <div className="field">
                <label htmlFor="end_date">End date</label>
                <input
                  id="end_date"
                  name="end_date"
                  type="date"
                  value={filters.end_date}
                  onChange={onFilterChange}
                />
              </div>
              <div className="filters-actions">
                <button className="btn" type="submit">
                  Apply
                </button>
                <button className="btn btn-ghost" type="button" onClick={onReset}>
                  Reset
                </button>
              </div>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                name="no_trainer"
                checked={filters.no_trainer}
                onChange={onFilterChange}
              />
              Without trainer (draft + waiting)
            </label>
          </form>
        </div>
        <div className="card">
          {loading ? (
            <p className="muted">Loading trainings...</p>
          ) : error ? (
            <p className="error">{error}</p>
          ) : trainings.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Customer</th>
                    <th>Address</th>
                    <th>When</th>
                    <th>Status</th>
                    <th>Trainer</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {trainings.map((training) => (
                    <tr key={training.id}>
                      <td>{training.training_type?.name}</td>
                      <td>{training.customer_name || "--"}</td>
                      <td>{training.address}</td>
                      <td>{new Date(training.start_datetime).toLocaleString()}</td>
                      <td>
                        <span className="pill">{training.status_label}</span>
                      </td>
                      <td>{training.assigned_trainer?.name || "--"}</td>
                      <td>
                        <Link className="text-link" to={`/trainings/${training.id}`}>
                          Detail
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <div>
                <h3>No trainings yet</h3>
                <p>Create the first training to start matching trainers.</p>
              </div>
              <Link className="btn" to="/trainings/new">
                Add training
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default TrainingsList;
