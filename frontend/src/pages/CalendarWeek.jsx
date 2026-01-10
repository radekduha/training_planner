import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { fetchCalendarWeek } from "../api/calendar.js";
import PageHeader from "../components/PageHeader.jsx";

const CalendarWeek = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [calendar, setCalendar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const date = searchParams.get("date");

  useEffect(() => {
    setLoading(true);
    fetchCalendarWeek({ date })
      .then((data) => setCalendar(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [date]);

  const goToDate = (nextDate) => {
    setSearchParams({ date: nextDate });
  };

  return (
    <section className="stack">
      <PageHeader
        title={calendar ? `Week of ${calendar.week_start}` : "Week view"}
        subtitle="Focused view of the current week."
        actions={
          calendar ? (
            <div className="inline-actions">
              <button className="btn btn-ghost" type="button" onClick={() => goToDate(calendar.prev_date)}>
                Prev
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => goToDate(calendar.next_date)}>
                Next
              </button>
              <Link className="btn" to="/calendar">
                Month view
              </Link>
            </div>
          ) : null
        }
      />
      <div className="card">
        {loading ? (
          <p className="muted">Loading week...</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : calendar ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {calendar.days.map((day) => (
                    <th key={day.date}>{day.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {calendar.days.map((day) => (
                    <td key={day.date} className="week-cell">
                      {day.trainings.length ? (
                        day.trainings.map((training) => (
                          <div key={training.id} className="calendar-item">
                            <Link className="text-link" to={`/trainings/${training.id}`}>
                              {training.label}
                              {training.customer_name ? ` / ${training.customer_name}` : ""}
                            </Link>
                            <div className="muted">
                              {training.start_time} / {training.status_label}
                              {!training.customer_name ? ` / ${training.address}` : ""}
                            </div>
                          </div>
                        ))
                      ) : (
                        <span className="muted">--</span>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default CalendarWeek;
