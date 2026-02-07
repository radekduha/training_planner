import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchTrainers } from "../api/trainers.js";
import PageHeader from "../components/PageHeader.jsx";
import useRealtimeInvalidate from "../hooks/useRealtimeInvalidate.js";

const PAGE_LIMIT = 50;

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

const TrainersList = () => {
  const [trainers, setTrainers] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const loadTrainers = useCallback(async (options = {}) => {
    const { append = false, cursor = null } = options;
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setError(null);
    }

    try {
      const data = await fetchTrainers({ limit: PAGE_LIMIT, cursor });
      const incoming = data.items || [];
      if (append) {
        setTrainers((prev) => [...prev, ...incoming]);
      } else {
        setTrainers(incoming);
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
    loadTrainers();
  }, [loadTrainers]);

  useRealtimeInvalidate(
    useCallback(() => {
      loadTrainers();
    }, [loadTrainers])
  );

  const onLoadMore = () => {
    if (!nextCursor || loadingMore) {
      return;
    }
    loadTrainers({ append: true, cursor: nextCursor });
  };

  return (
    <section className="stack">
      <PageHeader
        title="Trenéři"
        subtitle="Správa interně používaných trenérů a jejich kapacity slotů."
        actions={
          <Link className="btn btn-primary" to="/trainers/new">
            Přidat trenéra
          </Link>
        }
      />
      <div className="card">
        {loading ? (
          <p className="muted">Načítání trenérů...</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : trainers.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Jméno</th>
                    <th>Kontakt</th>
                    <th>Přiřazené poptávky</th>
                    <th>Nejbližší přiřazený slot</th>
                  </tr>
                </thead>
                <tbody>
                  {trainers.map((trainer) => (
                    <tr key={trainer.id}>
                      <td>
                        <Link className="text-link" to={`/trainers/${trainer.id}`}>
                          {trainer.display_name || trainer.name}
                        </Link>
                      </td>
                      <td>{trainer.email || trainer.phone || "--"}</td>
                      <td>{trainer.assigned_trainings_count ?? 0}</td>
                      <td>
                        {trainer.next_assigned_training
                          ? `${formatDateTime(trainer.next_assigned_training.assigned_start_datetime)} / ${
                              trainer.next_assigned_training.training_type?.name || "Téma"
                            }`
                          : "--"}
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
              <h3>Zatím žádní trenéři</h3>
              <p>Přidej trenéry, dovednosti a jejich dostupné sloty.</p>
            </div>
            <Link className="btn" to="/trainers/new">
              Nový trenér
            </Link>
          </div>
        )}
      </div>
    </section>
  );
};

export default TrainersList;
