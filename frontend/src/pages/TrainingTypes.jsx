import { useEffect, useState } from "react";

import { createTrainingType, fetchTrainingTypes } from "../api/trainingTypes.js";
import FormField from "../components/FormField.jsx";
import PageHeader from "../components/PageHeader.jsx";

const TrainingTypes = () => {
  const [types, setTypes] = useState([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const loadTypes = () => {
    setLoading(true);
    fetchTrainingTypes()
      .then((data) => setTypes(data.items || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTypes();
  }, []);

  const onSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createTrainingType({ name });
      setName("");
      loadTypes();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="stack">
      <PageHeader title="Typy tréninků" subtitle="Spravujte kategorie tréninků." />
      <div className="grid two">
        <div className="card">
          <h3>Typy</h3>
          {loading ? (
            <p className="muted">Načítání typů...</p>
          ) : types.length ? (
            <ul className="list">
              {types.map((type) => (
                <li key={type.id}>{type.name}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">Zatím žádné typy tréninků.</p>
          )}
        </div>
        <div className="card">
          <h3>Přidat typ</h3>
          <form onSubmit={onSubmit} className="stack">
            <FormField label="Název" htmlFor="name">
              <input id="name" value={name} onChange={(event) => setName(event.target.value)} />
            </FormField>
            {error ? <p className="error">{error}</p> : null}
            <button className="btn" type="submit" disabled={saving || !name.trim()}>
              {saving ? "Ukládám..." : "Uložit"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
};

export default TrainingTypes;
