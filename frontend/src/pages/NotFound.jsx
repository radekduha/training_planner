import { Link } from "react-router-dom";

const NotFound = () => {
  return (
    <section className="stack">
      <div className="card">
        <h1>Stránka nenalezena</h1>
        <p className="muted">Požadovaná stránka zatím neexistuje.</p>
        <Link className="btn" to="/">
          Přejít na tréninky
        </Link>
      </div>
    </section>
  );
};

export default NotFound;
