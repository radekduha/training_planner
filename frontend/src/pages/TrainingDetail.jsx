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
        <p className="muted">Loading training...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="stack">
        <div className="card">
          <h2>Training detail</h2>
          <p className="error">{error}</p>
          <Link className="btn" to="/">
            Back to trainings
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
        title={`Training #${training.id}`}
        subtitle={`${training.training_type?.name} / ${new Date(
          training.start_datetime
        ).toLocaleString()}`}
        actions={
          <Link className="btn btn-ghost" to={`/trainings/${training.id}/edit`}>
            Edit training
          </Link>
        }
      />
      <div className="grid two">
        <div className="card">
          <h3>Training detail</h3>
          <div className="detail-list">
            <div>
              <span className="muted">Customer</span>
              <strong>{training.customer_name || "--"}</strong>
            </div>
            <div>
              <span className="muted">Address</span>
              <strong>{training.address}</strong>
            </div>
            <div>
              <span className="muted">Lat/Lng</span>
              <strong>
                {training.lat ?? "--"}, {training.lng ?? "--"}
              </strong>
            </div>
            <div>
              <span className="muted">Status</span>
              <strong>{training.status_label}</strong>
            </div>
            <div>
              <span className="muted">Trainer</span>
              <strong>{training.assigned_trainer?.name || "--"}</strong>
            </div>
          </div>
          <h3>Update</h3>
          <form onSubmit={onSubmit} className="stack">
            <FormField label="Status" htmlFor="status">
              <select id="status" name="status" value={formState.status} onChange={onChange}>
                {meta.status_choices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Assigned trainer" htmlFor="assigned_trainer">
              <select
                id="assigned_trainer"
                name="assigned_trainer"
                value={formState.assigned_trainer}
                onChange={onChange}
              >
                <option value="">Unassigned</option>
                {meta.trainer_choices.map((trainer) => (
                  <option key={trainer.id} value={trainer.id}>
                    {trainer.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Customer" htmlFor="customer_name">
              <input
                id="customer_name"
                name="customer_name"
                value={formState.customer_name}
                onChange={onChange}
              />
            </FormField>
            <FormField label="Assignment reason" htmlFor="assignment_reason">
              <textarea
                id="assignment_reason"
                name="assignment_reason"
                value={formState.assignment_reason}
                onChange={onChange}
              />
            </FormField>
            <FormField label="Notes" htmlFor="notes">
              <textarea id="notes" name="notes" value={formState.notes} onChange={onChange} />
            </FormField>
            {formError ? <p className="error">{formError}</p> : null}
            <div className="inline-actions">
              <button className="btn" type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </button>
              <Link className="btn btn-ghost" to="/">
                Back
              </Link>
            </div>
          </form>
        </div>
        <div className="card">
          <h3>Recommended trainers</h3>
          {recommendations.used_compromise && recommendations.matches.length ? (
            <p className="muted">No trainer meets all conditions. Showing compromises.</p>
          ) : null}
          {recommendations.matches.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Trainer</th>
                    <th>Score</th>
                    <th>Cost</th>
                    <th>Why</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recommendations.matches.map((match) => (
                    <tr key={match.trainer.id}>
                      <td>{match.trainer.name}</td>
                      <td>{Math.round(match.score)}</td>
                      <td>{match.estimated_cost ? `${Math.round(match.estimated_cost)} CZK` : "--"}</td>
                      <td>
                        {match.reasons.map((reason) => (
                          <div key={reason}>{reason}</div>
                        ))}
                        {match.warnings.map((warning) => (
                          <div key={warning} className="muted">
                            Warning: {warning}
                          </div>
                        ))}
                      </td>
                      <td>
                        <button className="btn btn-ghost" type="button" onClick={() => onAssign(match)}>
                          Assign
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
                ? "No trainer meets the conditions and no close compromise was found."
                : "No recommendations yet. Add trainers and ensure the address has coordinates."}
            </p>
          )}
        </div>
      </div>
    </section>
  );
};

export default TrainingDetail;
