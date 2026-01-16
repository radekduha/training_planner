import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { fetchMeta } from "../api/meta.js";
import { fetchTraining, patchTraining } from "../api/trainings.js";
import PageHeader from "../components/PageHeader.jsx";
import FormField from "../components/FormField.jsx";

const TrainingDetail = () => {
  const { id } = useParams();
  const [training, setTraining] = useState(null);
  const [recommendations, setRecommendations] = useState({ matches: [], used_compromise: false });
  const [meta, setMeta] = useState({ status_choices: [], trainer_choices: [] });
  const [formState, setFormState] = useState({
    status: "",
    assigned_trainer: "",
    customer_name: "",
    assignment_reason: "",
    notes: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);

  const loadTraining = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTraining(id);
      setTraining(data.item);
      setRecommendations(data.recommendations || { matches: [], used_compromise: false });
      setFormState({
        status: data.item.status || "",
        assigned_trainer: data.item.assigned_trainer?.id || "",
        customer_name: data.item.customer_name || "",
        assignment_reason: data.item.assignment_reason || "",
        notes: data.item.notes || "",
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeta()
      .then((data) => {
        setMeta({
          status_choices: data.status_choices || [],
          trainer_choices: data.trainer_choices || [],
        });
      })
      .catch(() => {});
    loadTraining();
  }, [id]);

  const onChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        status: formState.status,
        assigned_trainer: formState.assigned_trainer || null,
        customer_name: formState.customer_name,
        assignment_reason: formState.assignment_reason,
        notes: formState.notes,
      };
      const data = await patchTraining(id, payload);
      setTraining(data.item);
      await loadTraining();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const onAssign = async (match) => {
    setSaving(true);
    setFormError(null);
    try {
      const reasonParts = [...match.reasons];
      if (match.warnings?.length) {
        reasonParts.push(`Warnings: ${match.warnings.join(", ")}`);
      }
      const payload = {
        status: "assigned",
        assigned_trainer: match.trainer.id,
        customer_name: formState.customer_name,
        assignment_reason: reasonParts.join(" | "),
        notes: formState.notes,
      };
      await patchTraining(id, payload);
      await loadTraining();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="stack">
        <p className="muted">Načítání tréninku...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="stack">
        <div className="card">
          <h2>Detail tréninku</h2>
          <p className="error">{error}</p>
          <Link className="btn" to="/trainings">
            Zpět na tréninky
          </Link>
        </div>
      </section>
    );
  }

  if (!training) {
    return null;
  }

  return (
    <section className="stack">
      <PageHeader
        title={`Trénink #${training.id}`}
        subtitle={`${training.training_type?.name} / ${new Date(
          training.start_datetime
        ).toLocaleString()}`}
        actions={
          <Link className="btn btn-ghost" to={`/trainings/${training.id}/edit`}>
            Upravit trénink
          </Link>
        }
      />
      <div className="grid two">
        <div className="card">
          <h3>Detail tréninku</h3>
          <div className="detail-list">
            <div>
              <span className="muted">Zákazník</span>
              <strong>{training.customer_name || "--"}</strong>
            </div>
            <div>
              <span className="muted">Adresa</span>
              <strong>{training.address}</strong>
            </div>
            <div>
              <span className="muted">Souřadnice</span>
              <strong>
                {training.lat ?? "--"}, {training.lng ?? "--"}
              </strong>
            </div>
            <div>
              <span className="muted">Stav</span>
              <strong>{training.status_label}</strong>
            </div>
            <div>
              <span className="muted">Trenér</span>
              <strong>
                {training.assigned_trainer?.display_name ||
                  training.assigned_trainer?.name ||
                  "--"}
              </strong>
            </div>
          </div>
          <h3>Upravit</h3>
          <form onSubmit={onSubmit} className="stack">
            <FormField label="Stav" htmlFor="status">
              <select id="status" name="status" value={formState.status} onChange={onChange}>
                {meta.status_choices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Přiřazený trenér" htmlFor="assigned_trainer">
              <select
                id="assigned_trainer"
                name="assigned_trainer"
                value={formState.assigned_trainer}
                onChange={onChange}
              >
                <option value="">Nepřiřazeno</option>
                {meta.trainer_choices.map((trainer) => (
                  <option key={trainer.id} value={trainer.id}>
                    {trainer.display_name || trainer.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Zákazník" htmlFor="customer_name">
              <input
                id="customer_name"
                name="customer_name"
                value={formState.customer_name}
                onChange={onChange}
              />
            </FormField>
            <FormField label="Důvod přiřazení" htmlFor="assignment_reason">
              <textarea
                id="assignment_reason"
                name="assignment_reason"
                value={formState.assignment_reason}
                onChange={onChange}
              />
            </FormField>
            <FormField label="Poznámky" htmlFor="notes">
              <textarea id="notes" name="notes" value={formState.notes} onChange={onChange} />
            </FormField>
            {formError ? <p className="error">{formError}</p> : null}
            <div className="inline-actions">
              <button className="btn" type="submit" disabled={saving}>
                {saving ? "Ukládám..." : "Uložit změny"}
              </button>
              <Link className="btn btn-ghost" to="/trainings">
                Zpět
              </Link>
            </div>
          </form>
        </div>
        <div className="card">
          <h3>Doporučení trenéři</h3>
          {recommendations.used_compromise && recommendations.matches.length ? (
            <p className="muted">
              Žádný trenér nesplňuje všechny podmínky. Zobrazuji kompromisy.
            </p>
          ) : null}
          {recommendations.matches.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Trenér</th>
                    <th>Skóre</th>
                    <th>Náklady</th>
                    <th>Proč</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recommendations.matches.map((match) => (
                    <tr key={match.trainer.id}>
                      <td>{match.trainer.display_name || match.trainer.name}</td>
                      <td>{Math.round(match.score)}</td>
                      <td>{match.estimated_cost ? `${Math.round(match.estimated_cost)} Kč` : "--"}</td>
                      <td>
                        {match.reasons.map((reason) => (
                          <div key={reason}>{reason}</div>
                        ))}
                        {match.warnings.map((warning) => (
                          <div key={warning} className="muted">
                            Upozornění: {warning}
                          </div>
                        ))}
                      </td>
                      <td>
                        <button className="btn btn-ghost" type="button" onClick={() => onAssign(match)}>
                          Přiřadit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">
              {recommendations.used_compromise
                ? "Žádný trenér nesplňuje podmínky a nenašel se ani blízký kompromis."
                : "Zatím žádná doporučení. Přidejte trenéry a zkontrolujte, že adresa má souřadnice."}
            </p>
          )}
        </div>
      </div>
    </section>
  );
};

export default TrainingDetail;
