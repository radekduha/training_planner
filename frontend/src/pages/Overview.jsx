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
        title="Přehled"
        subtitle="Nejdůležitější signály z vašeho tréninkového procesu."
        actions={
          <Link className="btn btn-ghost" to="/trainings">
            Zobrazit tréninky
          </Link>
        }
      />
      <div className="overview-stats">
        <div className="card stat-card">
          <div className="stat-label">Dnes</div>
          <div className="stat-value">{showPlaceholder ? "--" : stats.today}</div>
          <div className="stat-meta">{range.today || "Dnes"}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Příštích 7 dní</div>
          <div className="stat-value">{showPlaceholder ? "--" : stats.week}</div>
          <div className="stat-meta">{range.week || "Tento týden"}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Chybí trenér</div>
          <div className="stat-value">{showPlaceholder ? "--" : stats.unassigned}</div>
          <div className="stat-meta">Koncept + čeká</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Trenéři</div>
          <div className="stat-value">{showPlaceholder ? "--" : stats.trainers}</div>
          <div className="stat-meta">Aktivní profily</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Typy tréninků</div>
          <div className="stat-value">{showPlaceholder ? "--" : stats.types}</div>
          <div className="stat-meta">Kategorie</div>
        </div>
      </div>
      <div className="grid two">
        <div className="card">
          <h2>Nadcházející tréninky</h2>
          {loading ? (
            <p className="muted">Načítání přehledu...</p>
          ) : error ? (
            <p className="error">{error}</p>
          ) : lists.upcoming.length ? (
            <>
              <ul className="overview-list">
                {lists.upcoming.map((training) => (
                  <li key={training.id} className="overview-item">
                    <div>
                      <div className="overview-item-title">
                        {training.training_type?.name || "Trénink"}
                      </div>
                      <div className="muted">
                        {new Date(training.start_datetime).toLocaleString()} -{" "}
                        {training.customer_name || "Neznámý zákazník"}
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
                  Zobrazit všechny nadcházející tréninky
                </Link>
              ) : null}
            </>
          ) : (
            <p className="muted">V příštích 7 dnech nejsou žádné tréninky.</p>
          )}
        </div>
        <div className="card">
          <h2>Chybí trenér</h2>
          {loading ? (
            <p className="muted">Načítání přehledu...</p>
          ) : error ? (
            <p className="error">{error}</p>
          ) : lists.needsTrainer.length ? (
            <>
              <ul className="overview-list">
                {lists.needsTrainer.map((training) => (
                  <li key={training.id} className="overview-item">
                    <div>
                      <div className="overview-item-title">
                        {training.training_type?.name || "Trénink"}
                      </div>
                      <div className="muted">
                        {new Date(training.start_datetime).toLocaleString()} -{" "}
                        {training.address || "Chybí adresa"}
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
              {stats.unassigned > lists.needsTrainer.length ? (
                <Link className="text-link" to="/trainings">
                  Zkontrolovat nepřiřazené tréninky
                </Link>
              ) : null}
            </>
          ) : (
            <p className="muted">Vše je přiřazeno. Skvělá práce.</p>
          )}
        </div>
      </div>
      <div className="card">
        <h2>Rychlé akce</h2>
        <p className="muted">Udržujte tempo několika kliknutími.</p>
        <div className="overview-actions">
          <Link className="btn" to="/trainings/new">
            Vytvořit trénink
          </Link>
          <Link className="btn btn-ghost" to="/trainers/new">
            Vytvořit trenéra
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
