import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchMeta } from "../api/meta.js";
import { fetchTrainings } from "../api/trainings.js";
import PageHeader from "../components/PageHeader.jsx";
import useRealtimeInvalidate from "../hooks/useRealtimeInvalidate.js";

const PAGE_LIMIT = 50;

const emptyFilters = {
  status: "",
  training_type: "",
  start_date: "",
  end_date: "",
  no_trainer: false,
};

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

const formatWindow = (item) => {
  const start = item.request_window_start;
  const end = item.request_window_end;
  if (!start && !end) {
    return "--";
  }
  return `${formatDateTime(start)} -> ${formatDateTime(end)}`;
};

const TrainingsList = () => {
  const [filters, setFilters] = useState(emptyFilters);
  const [meta, setMeta] = useState({ status_choices: [], training_types: [] });
  const [trainings, setTrainings] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const loadTrainings = useCallback(async (activeFilters, options = {}) => {
    const { append = false, cursor = null } = options;
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setError(null);
    }

    try {
      const payload = {
        ...activeFilters,
        no_trainer: activeFilters.no_trainer ? "1" : "",
        limit: PAGE_LIMIT,
        cursor,
      };
      const data = await fetchTrainings(payload);
      const incoming = data.items || [];

      if (append) {
        setTrainings((prev) => [...prev, ...incoming]);
      } else {
        setTrainings(incoming);
      }
      setNextCursor(data.next_cursor || null);
    } catch (err) {
      setError(err.message);
    } finally {
      if (append) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

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
  }, [loadTrainings]);

  useRealtimeInvalidate(
    useCallback(() => {
      loadTrainings(filters);
    }, [filters, loadTrainings])
  );

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

  const onLoadMore = () => {
    if (!nextCursor || loadingMore) {
      return;
    }
    loadTrainings(filters, { append: true, cursor: nextCursor });
  };

  return (
    <section className="stack">
      <PageHeader
        title="Poptávky školení"
        subtitle="Plánování podle časového okna a dostupných slotů trenérů."
        actions={
          <Link className="btn btn-primary" to="/trainings/new">
            Nová poptávka
          </Link>
        }
      />
      <div className="grid">
        <div className="card">
          <h2>Filtry</h2>
          <form onSubmit={onSubmit} className="filters-form">
            <div className="filters">
              <div className="field">
                <label htmlFor="status">Stav</label>
                <select id="status" name="status" value={filters.status} onChange={onFilterChange}>
                  <option value="">Vše</option>
                  {meta.status_choices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="training_type">Téma</label>
                <select
                  id="training_type"
                  name="training_type"
                  value={filters.training_type}
                  onChange={onFilterChange}
                >
                  <option value="">Vše</option>
                  {meta.training_types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="start_date">Okno od</label>
                <input
                  id="start_date"
                  name="start_date"
                  type="date"
                  value={filters.start_date}
                  onChange={onFilterChange}
                />
              </div>
              <div className="field">
                <label htmlFor="end_date">Okno do</label>
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
                  Použít
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
              Bez přiřazeného trenéra
            </label>
          </form>
        </div>

        <div className="card">
          {loading ? (
            <p className="muted">Načítání poptávek...</p>
          ) : error ? (
            <p className="error">{error}</p>
          ) : trainings.length ? (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Téma</th>
                      <th>Organizace</th>
                      <th>Lokalita</th>
                      <th>Časové okno</th>
                      <th>Přiřazený slot</th>
                      <th>Stav</th>
                      <th>Trenér</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainings.map((training) => (
                      <tr key={training.id}>
                        <td>{training.training_type?.name || "--"}</td>
                        <td>{training.customer_name || "--"}</td>
                        <td>{training.address || "--"}</td>
                        <td>{formatWindow(training)}</td>
                        <td>
                          {training.assigned_start_datetime
                            ? `${formatDateTime(training.assigned_start_datetime)} -> ${formatDateTime(
                                training.assigned_end_datetime
                              )}`
                            : "--"}
                        </td>
                        <td>
                          <span className="pill">{training.status_label}</span>
                        </td>
                        <td>
                          {training.assigned_trainer?.display_name ||
                            training.assigned_trainer?.name ||
                            "--"}
                        </td>
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
              {nextCursor ? (
                <div className="inline-actions">
                  <button className="btn btn-ghost" type="button" onClick={onLoadMore} disabled={loadingMore}>
                    {loadingMore ? "Načítám..." : "Načíst další"}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state">
              <div>
                <h3>Zatím žádné poptávky</h3>
                <p>Vytvořte první poptávku a systém nabídne trenéry se sloty.</p>
              </div>
              <Link className="btn" to="/trainings/new">
                Nová poptávka
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default TrainingsList;
