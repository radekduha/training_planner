import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { requestJson } from "../api/client.js";

const navItems = [
  { to: "/", label: "Přehled" },
  { to: "/trainings", label: "Poptávky" },
  { to: "/trainers", label: "Trenéři" },
  { to: "/training-types", label: "Témata" },
];

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="4" width="18" height="17" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <line x1="8" y1="2.5" x2="8" y2="6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <line x1="16" y1="2.5" x2="16" y2="6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const utilityItems = [{ to: "/calendar", label: "Kalendář", icon: CalendarIcon }];

const actionItems = [
  { to: "/trainings/new", label: "Nová poptávka" },
  { to: "/trainers/new", label: "Vytvořit trenéra" },
];

const Layout = () => {
  const navigate = useNavigate();

  const onLogout = async () => {
    try {
      await requestJson("/logout/", { method: "POST" });
    } catch (err) {
      // Ignore logout errors and force navigation.
    } finally {
      navigate("/login");
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">TP</div>
          <div>
            <div className="brand-title">Training Planner</div>
            <div className="brand-subtitle">Availability-first plánování poptávek a slotů</div>
          </div>
        </div>
        <nav className="app-nav">
          <div className="nav-group">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  isActive ? "nav-link nav-link-active" : "nav-link"
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
        <div className="nav-actions">
          <div className="nav-utility">
            {utilityItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                aria-label={item.label}
                title={item.label}
                className={({ isActive }) =>
                  isActive
                    ? "nav-link nav-link-utility nav-link-icon nav-link-active"
                    : "nav-link nav-link-utility nav-link-icon"
                }
              >
                {item.icon ? <item.icon /> : null}
                <span className="sr-only">{item.label}</span>
              </NavLink>
            ))}
          </div>
          <div className="nav-group nav-group-actions">
            {actionItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  isActive ? "nav-link nav-link-action nav-link-active" : "nav-link nav-link-action"
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
          <button className="nav-link nav-link-button" type="button" onClick={onLogout}>
            Odhlásit se
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
