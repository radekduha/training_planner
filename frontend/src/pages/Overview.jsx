import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchTrainings } from "../api/trainings.js";
import { fetchTrainers } from "../api/trainers.js";
import { fetchTrainingTypes } from "../api/trainingTypes.js";
import PageHeader from "../components/PageHeader.jsx";
import useRealtimeInvalidate from "../hooks/useRealtimeInvalidate.js";

const formatDate = (date) => date.toISOString().slice(0, 10);

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

const Overview = () => {
  const [stats, setStats] = useState({
    open: 0,
    assigned: 0,
    confirmed: 0,
    trainers: 0,
    topics: 0,
  });
  const [lists, setLists] = useState({ upcoming: [], needsAssignment: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const today = new Date();
      const next30 = new Date(today);
      next30.setDate(today.getDate() + 30);

      const [openData, assignedData, confirmedData, trainersData, typesData] = await Promise.all([
        fetchTrainings({ status: "open", limit: 100 }),
        fetchTrainings({ status: "assigned", limit: 100 }),
        fetchTrainings({ status: "confirmed", limit: 100 }),
        fetchTrainers({ limit: 1 }),
        fetchTrainingTypes(),
      ]);

      const upcoming = [...(assignedData.items || []), ...(confirmedData.items || [])]
        .filter((item) => {
          const start = item.assigned_start_datetime;
          if (!start) {
            return false;
          }
          const date = new Date(start);
          return date >= today && date <= next30;
        })
        .sort(
          (a, b) =>
            new Date(a.assigned_start_datetime).getTime() -
            new Date(b.assigned_start_datetime).getTime()
        )
        .slice(0, 5);

      const needsAssignment = (openData.items || [])
        .sort(
          (a, b) =>
            new Date(a.request_window_start || 0).getTime() -
            new Date(b.request_window_start || 0).getTime()
        )
        .slice(0, 5);

      setStats({
        open: openData.total_count ?? openData.items?.length ?? 0,
        assigned: assignedData.total_count ?? assignedData.items?.length ?? 0,
        confirmed: confirmedData.total_count ?? confirmedData.items?.length ?? 0,
        trainers: trainersData.total_count ?? trainersData.items?.length ?? 0,
        topics: typesData.items?.length || 0,
      });
      setLists({ upcoming, needsAssignment });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useRealtimeInvalidate(
    useCallback(() => {
      loadOverview();
    }, [loadOverview])
  );

  const showPlaceholder = loading || error;

  return (
    <section className="stack">
      <PageHeader
        title="Přehled"
        subtitle="Stav poptávek, kapacity a přiřazení v availability-first režimu."
        actions={
          <Link className="btn btn-ghost" to="/trainings">
            Otevřít poptávky
          </Link>
        }
      />

      <div className="overview-stats">
        <div className="card stat-card">
          <div className="stat-label">Open</div>
          <div className="stat-value">{showPlaceholder ? "--" : stats.open}</div>
          <div className="stat-meta">Čeká na přiřazení slotu</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Assigned</div>
          <div className="stat-value">{showPlaceholder ? "--" : stats.assigned}</div>
          <div className="stat-meta">Slot přiřazen interně</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Confirmed</div>
          <div className="stat-value">{showPlaceholder ? "--" : stats.confirmed}</div>
          <div className="stat-meta">Potvrzené realizace</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Trenéři</div>
          <div className="stat-value">{showPlaceholder ? "--" : stats.trainers}</div>
          <div className="stat-meta">Aktivní profily</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Témata</div>
          <div className="stat-value">{showPlaceholder ? "--" : stats.topics}</div>
          <div className="stat-meta">Katalog témat</div>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Nadcházející přiřazené sloty (30 dní)</h2>
          {loading ? (
            <p className="muted">Načítání přehledu...</p>
          ) : error ? (
            <p className="error">{error}</p>
          ) : lists.upcoming.length ? (
            <ul className="overview-list">
              {lists.upcoming.map((training) => (
                <li key={training.id} className="overview-item">
                  <div>
                    <div className="overview-item-title">
                      {training.training_type?.name || `Poptávka #${training.id}`}
                    </div>
                    <div className="muted">
                      {formatDateTime(training.assigned_start_datetime)} / {training.customer_name || "--"}
                    </div>
                  </div>
                  <div className="overview-item-meta">
                    <span className="pill">{training.status_label}</span>
                    <Link className="text-link" to={`/trainings/${training.id}`}>
                      Detail
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">V následujících 30 dnech nejsou přiřazené sloty.</p>
          )}
        </div>

        <div className="card">
          <h2>Čeká na přiřazení</h2>
          {loading ? (
            <p className="muted">Načítání přehledu...</p>
          ) : error ? (
            <p className="error">{error}</p>
          ) : lists.needsAssignment.length ? (
            <ul className="overview-list">
              {lists.needsAssignment.map((training) => (
                <li key={training.id} className="overview-item">
                  <div>
                    <div className="overview-item-title">
                      {training.training_type?.name || `Poptávka #${training.id}`}
                    </div>
                    <div className="muted">
                      {formatDateTime(training.request_window_start)}
                      {" -> "}
                      {formatDateTime(training.request_window_end)}
                    </div>
                  </div>
                  <div className="overview-item-meta">
                    <span className="pill">{training.status_label}</span>
                    <Link className="text-link" to={`/trainings/${training.id}`}>
                      Přiřadit
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Žádná otevřená poptávka.</p>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Rychlé akce</h2>
        <div className="overview-actions">
          <Link className="btn" to="/trainings/new">
            Nová poptávka
          </Link>
          <Link className="btn btn-ghost" to="/trainers/new">
            Nový trenér
          </Link>
          <Link className="btn btn-ghost" to="/calendar">
            Otevřít kalendář
          </Link>
        </div>
      </div>
    </section>
  );
};

export default Overview;
