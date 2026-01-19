import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { fetchMeta } from "../api/meta.js";
import { fetchTraining, patchTraining } from "../api/trainings.js";
import PageHeader from "../components/PageHeader.jsx";
import FormField from "../components/FormField.jsx";

const formatDate = (value) => {
  if (!value) {
    return "--";
  }
  return new Date(value).toLocaleDateString("cs-CZ");
};

const formatTime = (value) => {
  if (!value) {
    return "--";
  }
  return new Date(value).toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatBoolean = (value) => {
  if (value === true) {
    return "Ano";
  }
  if (value === false) {
    return "Ne";
  }
  return "--";
};

const formatNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return "--";
  }
  return value;
};

const formatMoney = (value) => {
  if (typeof value !== "number") {
    return "--";
  }
  return `${new Intl.NumberFormat("cs-CZ").format(value)} Kč`;
};

const formatText = (value) => (value ? value : "--");

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
        <p className="muted">Načítání školení...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="stack">
        <div className="card">
          <h2>Detail školení</h2>
          <p className="error">{error}</p>
          <Link className="btn" to="/trainings">
            Zpět na školení
          </Link>
        </div>
      </section>
    );
  }

  if (!training) {
    return null;
  }

  const trainingPlace = training.training_place || training.address || "";

  return (
    <section className="stack">
      <PageHeader
        title={`Školení #${training.id}`}
        subtitle={`${training.training_type?.name} / ${new Date(
          training.start_datetime
        ).toLocaleString()}`}
        actions={
          <Link className="btn btn-ghost" to={`/trainings/${training.id}/edit`}>
            Upravit školení
          </Link>
        }
      />
      <div className="grid two">
        <div className="card">
          <h3>Detail školení</h3>
          <div className="detail-list">
            <div>
              <span className="muted">Zákazník</span>
              <strong>{formatText(training.customer_name)}</strong>
            </div>
            <div>
              <span className="muted">Typ školení</span>
              <strong>{formatText(training.training_type?.name)}</strong>
            </div>
            <div>
              <span className="muted">Datum od</span>
              <strong>{formatDate(training.start_datetime)}</strong>
            </div>
            <div>
              <span className="muted">Datum do</span>
              <strong>{formatDate(training.end_datetime)}</strong>
            </div>
            <div>
              <span className="muted">Začátek</span>
              <strong>{formatTime(training.start_datetime)}</strong>
            </div>
            <div>
              <span className="muted">Konec</span>
              <strong>{formatTime(training.end_datetime)}</strong>
            </div>
            <div>
              <span className="muted">Počet účastníků</span>
              <strong>{formatNumber(training.visitors)}</strong>
            </div>
            <div>
              <span className="muted">Akreditace</span>
              <strong>{formatBoolean(training.accreditation)}</strong>
            </div>
            <div>
              <span className="muted">Počet hodin</span>
              <strong>{formatNumber(training.hours)}</strong>
            </div>
            <div>
              <span className="muted">Místo školení</span>
              <strong>{formatText(trainingPlace)}</strong>
            </div>
            <div>
              <span className="muted">Adresa</span>
              <strong>{formatText(training.address)}</strong>
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
          <h4>Fakturace</h4>
          <div className="detail-list">
            <div>
              <span className="muted">Plátce</span>
              <strong>{formatText(training.payer_address)}</strong>
            </div>
            <div>
              <span className="muted">IČO</span>
              <strong>{formatText(training.payer_id)}</strong>
            </div>
            <div>
              <span className="muted">Číslo faktury</span>
              <strong>{formatText(training.invoice_number)}</strong>
            </div>
            <div>
              <span className="muted">Fakturační e-mail</span>
              <strong>{formatText(training.invoice_email)}</strong>
            </div>
            <div>
              <span className="muted">E-mail pro schválení</span>
              <strong>{formatText(training.email_for_approval)}</strong>
            </div>
            <div>
              <span className="muted">Odměna lektora</span>
              <strong>{formatMoney(training.trainers_fee)}</strong>
            </div>
            <div>
              <span className="muted">Cena s DPH</span>
              <strong>{formatMoney(training.price_w_vat)}</strong>
            </div>
          </div>
          <h4>Kontakt a obsah</h4>
          <div className="detail-list">
            <div>
              <span className="muted">Kontaktní osoba</span>
              <strong>{formatText(training.contact_name)}</strong>
            </div>
            <div>
              <span className="muted">Telefon</span>
              <strong>{formatText(training.contact_phone)}</strong>
            </div>
            <div>
              <span className="muted">Studijní materiály</span>
              <strong>{formatText(training.study_materials)}</strong>
            </div>
            <div>
              <span className="muted">Info pro lektora</span>
              <strong>{formatText(training.info_for_the_trainer)}</strong>
            </div>
            <div>
              <span className="muted">Poznámka</span>
              <strong>{formatText(training.notes)}</strong>
            </div>
            <div>
              <span className="muted">PP</span>
              <strong>{formatText(training.pp)}</strong>
            </div>
            <div>
              <span className="muted">D</span>
              <strong>{formatText(training.d)}</strong>
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
