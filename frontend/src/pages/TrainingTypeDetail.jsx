import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { fetchTrainingType, updateTrainingType } from "../api/trainingTypes.js";
import FormField from "../components/FormField.jsx";
import PageHeader from "../components/PageHeader.jsx";

const formatValue = (value, fallback = "--") => {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  return value;
};

const getErrorMessage = (err) =>
  err?.payload?.errors?.name?.[0]?.message ||
  err?.payload?.errors?.duration_minutes?.[0]?.message ||
  err?.payload?.error ||
  err?.message ||
  "Něco se pokazilo.";

const TrainingTypeDetail = () => {
  const { id } = useParams();
  const [trainingType, setTrainingType] = useState(null);
  const [trainers, setTrainers] = useState([]);
  const [form, setForm] = useState({
    name: "",
    duration_minutes: "240",
    max_participants: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchTrainingType(id)
      .then((data) => {
        setTrainingType(data.item);
        setTrainers(data.trainers || []);
        setForm({
          name: data.item?.name || "",
          duration_minutes: String(data.item?.duration_minutes || 240),
          max_participants:
            data.item?.max_participants === null || data.item?.max_participants === undefined
              ? ""
              : String(data.item?.max_participants),
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setFormError("Název je povinný.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: trimmedName,
        duration_minutes: Number(form.duration_minutes || 240),
        max_participants: form.max_participants,
      };
      const data = await updateTrainingType(id, payload);
      setTrainingType(data.item);
      setForm((prev) => ({
        ...prev,
        name: data.item?.name || "",
        duration_minutes: String(data.item?.duration_minutes || 240),
      }));
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="stack">
        <p className="muted">Načítání tématu...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="stack">
        <div className="card">
          <h2>Detail tématu</h2>
          <p className="error">{error}</p>
          <Link className="btn" to="/training-types">
            Zpět na témata
          </Link>
        </div>
      </section>
    );
  }

  if (!trainingType) {
    return null;
  }

  return (
    <section className="stack">
      <PageHeader
        title={trainingType.name}
        subtitle="Fixní délka tématu a seznam trenérů se skill match."
        actions={
          <Link className="btn btn-ghost" to="/training-types">
            Zpět na seznam
          </Link>
        }
      />
      <div className="grid two">
        <div className="card">
          <h3>Parametry tématu</h3>
          <div className="detail-list two-column">
            <div className="detail-item">
              <span>Délka (min)</span>
              <strong>{formatValue(trainingType.duration_minutes, 240)}</strong>
            </div>
            <div className="detail-divider" role="presentation" />
            <div className="detail-item">
              <span>Max. účastníků</span>
              <strong>{formatValue(trainingType.max_participants)}</strong>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="stack">
            <FormField label="Název" htmlFor="name">
              <input
                id="name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </FormField>
            <FormField label="Délka (min)" htmlFor="duration-minutes">
              <input
                id="duration-minutes"
                type="number"
                min="30"
                step="30"
                value={form.duration_minutes}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, duration_minutes: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Max. počet účastníků" htmlFor="max-participants">
              <input
                id="max-participants"
                inputMode="numeric"
                value={form.max_participants}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, max_participants: event.target.value }))
                }
              />
            </FormField>
            {formError ? <p className="error">{formError}</p> : null}
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Ukládám..." : "Uložit změny"}
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Trenéři se skill match</h3>
          {trainers.length ? (
            <ul className="list">
              {trainers.map((trainer) => (
                <li key={trainer.id}>
                  <Link className="text-link" to={`/trainers/${trainer.id}`}>
                    {trainer.display_name || trainer.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">K tématu zatím není přiřazený žádný trenér.</p>
          )}
        </div>
      </div>
    </section>
  );
};

export default TrainingTypeDetail;
