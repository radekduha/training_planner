import { Link } from "react-router-dom";

const NotFound = () => {
  return (
    <section className="stack">
      <div className="card">
        <h1>Page not found</h1>
        <p className="muted">The requested page does not exist yet.</p>
        <Link className="btn" to="/">
          Go to trainings
        </Link>
      </div>
    </section>
  );
};

export default NotFound;
