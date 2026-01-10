import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/", label: "Trainings" },
  { to: "/calendar", label: "Calendar" },
  { to: "/calendar/week", label: "Week" },
  { to: "/trainings/new", label: "New training" },
  { to: "/trainers", label: "Trainers" },
  { to: "/trainers/new", label: "New trainer" },
  { to: "/training-types", label: "Training types" },
];

const Layout = () => {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">TP</div>
          <div>
            <div className="brand-title">Training Planner</div>
            <div className="brand-subtitle">Fast planning across the Czech Republic</div>
          </div>
        </div>
        <nav className="app-nav">
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
        </nav>
        <div className="nav-actions">
          <a className="nav-link" href="/logout/">
            Log out
          </a>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
