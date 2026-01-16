import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { fetchCalendarMonth } from "../api/calendar.js";
import PageHeader from "../components/PageHeader.jsx";

const CalendarMonth = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [calendar, setCalendar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const year = searchParams.get("year");
  const month = searchParams.get("month");

  useEffect(() => {
    setLoading(true);
    fetchCalendarMonth({
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
    })
      .then((data) => setCalendar(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [year, month]);

  const goToMonth = (nextYear, nextMonth) => {
    setSearchParams({ year: String(nextYear), month: String(nextMonth) });
  };

  return (
    <section className="stack">
      <PageHeader
        title={
          calendar ? `${calendar.month_name} ${calendar.year}` : "Kalendář"
        }
        subtitle="Měsíční přehled tréninků."
        actions={
          calendar ? (
            <div className="inline-actions">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => goToMonth(calendar.prev_year, calendar.prev_month)}
              >
                Předchozí
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => goToMonth(calendar.next_year, calendar.next_month)}
              >
                Další
              </button>
              <Link className="btn" to={`/calendar/week?date=${calendar.today}`}>
                Týdenní přehled
              </Link>
            </div>
          ) : null
        }
      />
      <div className="card">
        {loading ? (
          <p className="muted">Načítání kalendáře...</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : calendar ? (
          <div className="table-wrap">
            <table className="calendar">
              <thead>
                <tr>
                  <th>Po</th>
                  <th>Út</th>
                  <th>St</th>
                  <th>Čt</th>
                  <th>Pá</th>
                  <th>So</th>
                  <th>Ne</th>
                </tr>
              </thead>
              <tbody>
                {calendar.weeks.map((week, weekIndex) => (
                  <tr key={weekIndex}>
                    {week.map((day) => (
                      <td
                        key={day.date}
                        className={day.in_month ? "" : "off-month"}
                      >
                        <div className="calendar-day">{day.date.slice(-2)}</div>
                        {day.trainings.map((training) => (
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
                        ))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default CalendarMonth;
