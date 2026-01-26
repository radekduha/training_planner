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

const formatFieldValue = (value) => (value === null || value === undefined ? "" : String(value));

const getErrorMessage = (err) =>
  err?.payload?.errors?.name?.[0]?.message ||
  err?.payload?.errors?.teaching_hours?.[0]?.message ||
  err?.payload?.errors?.max_participants?.[0]?.message ||
  err?.payload?.error ||
  err?.message ||
  "Něco se pokazilo.";

const TrainingTypeDetail = () => {
  const { id } = useParams();
  const [trainingType, setTrainingType] = useState(null);
  const [trainers, setTrainers] = useState([]);
  const [form, setForm] = useState({
    name: "",
    teaching_hours: "",
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
          teaching_hours: formatFieldValue(data.item?.teaching_hours),
          max_participants: formatFieldValue(data.item?.max_participants),
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    if (formError) {
      setFormError(null);
    }
  };

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
        teaching_hours: form.teaching_hours,
        max_participants: form.max_participants,
      };
      const data = await updateTrainingType(id, payload);
      setTrainingType(data.item);
      setForm((prev) => ({
        ...prev,
        name: data.item?.name || "",
        teaching_hours: formatFieldValue(data.item?.teaching_hours),
        max_participants: formatFieldValue(data.item?.max_participants),
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
        <p className="muted">Načítání typu školení...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="stack">
        <div className="card">
          <h2>Detail typu školení</h2>
          <p className="error">{error}</p>
          <Link className="btn" to="/training-types">
            Zpět na typy školení
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
        subtitle="Parametry typu školení a přehled lektorů."
        actions={
          <Link className="btn btn-ghost" to="/training-types">
            Zpět na seznam
          </Link>
        }
      />
      <div className="grid two">
        <div className="card">
          <h3>Informace o kurzu</h3>
          <div className="detail-list two-column">
            <div className="detail-item">
              <span>Vyučující hodiny</span>
              <strong>{formatValue(trainingType.teaching_hours)}</strong>
            </div>
            <div className="detail-divider" role="presentation" />
            <div className="detail-item">
              <span>Maximální počet účastníků</span>
              <strong>{formatValue(trainingType.max_participants)}</strong>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="stack">
            <FormField label="Název" htmlFor="name">
              <input id="name" value={form.name} onChange={handleChange("name")} />
            </FormField>
            <FormField label="Vyučující hodiny" htmlFor="teaching-hours">
              <input
                id="teaching-hours"
                inputMode="decimal"
                value={form.teaching_hours}
                onChange={handleChange("teaching_hours")}
              />
            </FormField>
            <FormField label="Max. počet účastníků" htmlFor="max-participants">
              <input
                id="max-participants"
                inputMode="numeric"
                value={form.max_participants}
                onChange={handleChange("max_participants")}
              />
            </FormField>
            {formError ? <p className="error">{formError}</p> : null}
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Ukládám..." : "Uložit změny"}
            </button>
          </form>
        </div>
        <div className="card">
          <h3>Lektoři</h3>
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
            <p className="muted">Zatím žádní lektoři přiřazení k tomuto typu.</p>
          )}
        </div>
      </div>
    </section>
  );
};

export default TrainingTypeDetail;
