import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchTrainings } from "../api/trainings.js";
import { fetchTrainers } from "../api/trainers.js";
import { fetchTrainingTypes } from "../api/trainingTypes.js";
import PageHeader from "../components/PageHeader.jsx";

const formatDate = (date) => date.toISOString().slice(0, 10);

const sortByStart = (items = []) =>
  [...items].sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));

const Overview = () => {
  const [stats, setStats] = useState({
    today: 0,
    week: 0,
    unassigned: 0,
    trainers: 0,
    types: 0,
  });
  const [lists, setLists] = useState({ upcoming: [], needsTrainer: [] });
  const [range, setRange] = useState({ today: "", week: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const today = new Date();
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 6);
    const todayStr = formatDate(today);
    const weekEndStr = formatDate(weekEnd);

    setRange({
      today: today.toLocaleDateString(),
      week: `${today.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`,
    });

    const loadOverview = async () => {
      setLoading(true);
      setError(null);
      try {
        const [todayData, weekData, unassignedData, trainersData, typesData] =
          await Promise.all([
            fetchTrainings({ start_date: todayStr, end_date: todayStr }),
            fetchTrainings({ start_date: todayStr, end_date: weekEndStr }),
            fetchTrainings({ no_trainer: "1" }),
            fetchTrainers(),
            fetchTrainingTypes(),
          ]);

        const upcoming = sortByStart(weekData.items || []);
        const needsTrainer = sortByStart(unassignedData.items || []);

        setStats({
          today: todayData.items?.length || 0,
          week: weekData.items?.length || 0,
          unassigned: unassignedData.items?.length || 0,
          trainers: trainersData.items?.length || 0,
          types: typesData.items?.length || 0,
        });
        setLists({
          upcoming: upcoming.slice(0, 5),
          needsTrainer: needsTrainer.slice(0, 5),
        });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadOverview();
  }, []);

  const showPlaceholder = loading || error;

  return (
    <section className="stack">
      <PageHeader
        title="Overview"
        subtitle="The most important signals from your training pipeline."
        actions={
          <Link className="btn btn-ghost" to="/trainings">
            View trainings
          </Link>
        }
      />
      <div className="overview-stats">
        <div className="card stat-card">
          <div className="stat-label">Today</div>
          <div className="stat-value">{showPlaceholder ? "--" : stats.today}</div>
          <div className="stat-meta">{range.today || "Today"}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Next 7 days</div>
          <div className="stat-value">{showPlaceholder ? "--" : stats.week}</div>
          <div className="stat-meta">{range.week || "This week"}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Needs trainer</div>
          <div className="stat-value">{showPlaceholder ? "--" : stats.unassigned}</div>
          <div className="stat-meta">Draft + waiting</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Trainers</div>
          <div className="stat-value">{showPlaceholder ? "--" : stats.trainers}</div>
          <div className="stat-meta">Active profiles</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Training types</div>
          <div className="stat-value">{showPlaceholder ? "--" : stats.types}</div>
          <div className="stat-meta">Categories</div>
        </div>
      </div>
      <div className="grid two">
        <div className="card">
          <h2>Upcoming trainings</h2>
          {loading ? (
            <p className="muted">Loading overview...</p>
          ) : error ? (
            <p className="error">{error}</p>
          ) : lists.upcoming.length ? (
            <>
              <ul className="overview-list">
                {lists.upcoming.map((training) => (
                  <li key={training.id} className="overview-item">
                    <div>
                      <div className="overview-item-title">
                        {training.training_type?.name || "Training"}
                      </div>
                      <div className="muted">
                        {new Date(training.start_datetime).toLocaleString()} -{" "}
                        {training.customer_name || "Unnamed customer"}
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
              {stats.week > lists.upcoming.length ? (
                <Link className="text-link" to="/trainings">
                  View all upcoming trainings
                </Link>
              ) : null}
            </>
          ) : (
            <p className="muted">No trainings scheduled in the next 7 days.</p>
          )}
        </div>
        <div className="card">
          <h2>Needs trainer</h2>
          {loading ? (
            <p className="muted">Loading overview...</p>
          ) : error ? (
            <p className="error">{error}</p>
          ) : lists.needsTrainer.length ? (
            <>
              <ul className="overview-list">
                {lists.needsTrainer.map((training) => (
                  <li key={training.id} className="overview-item">
                    <div>
                      <div className="overview-item-title">
                        {training.training_type?.name || "Training"}
                      </div>
                      <div className="muted">
                        {new Date(training.start_datetime).toLocaleString()} -{" "}
                        {training.address || "Address missing"}
                      </div>
                    </div>
                    <div className="overview-item-meta">
                      <span className="pill">{training.status_label}</span>
                      <Link className="text-link" to={`/trainings/${training.id}`}>
                        Assign
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
              {stats.unassigned > lists.needsTrainer.length ? (
                <Link className="text-link" to="/trainings">
                  Review unassigned trainings
                </Link>
              ) : null}
            </>
          ) : (
            <p className="muted">Everything is assigned. Nice work.</p>
          )}
        </div>
      </div>
      <div className="card">
        <h2>Quick actions</h2>
        <p className="muted">Keep the pipeline moving with a few taps.</p>
        <div className="overview-actions">
          <Link className="btn" to="/trainings/new">
            Create training
          </Link>
          <Link className="btn btn-ghost" to="/trainers/new">
            Create trainer
          </Link>
          <Link className="btn btn-ghost" to="/calendar">
            Open calendar
          </Link>
        </div>
      </div>
    </section>
  );
};

export default Overview;
