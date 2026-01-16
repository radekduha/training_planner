import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { ensureCsrf, requestJson } from "../api/client.js";

const Login = () => {
  const navigate = useNavigate();
  const [formState, setFormState] = useState({ username: "", password: "" });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const onChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await ensureCsrf();
      await requestJson("/login/", {
        method: "POST",
        body: formState,
      });
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="card login-card">
        <h1>Přihlášení</h1>
        <p className="muted">Použijte přihlašovací údaje do Training Planneru.</p>
        <form onSubmit={onSubmit} className="stack">
          <div className="field">
            <label htmlFor="username">Uživatelské jméno</label>
            <input
              id="username"
              name="username"
              value={formState.username}
              onChange={onChange}
              autoComplete="username"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Heslo</label>
            <input
              id="password"
              name="password"
              type="password"
              value={formState.password}
              onChange={onChange}
              autoComplete="current-password"
              required
            />
          </div>
          {error ? <p className="error">{error}</p> : null}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Přihlašuji..." : "Přihlásit"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
