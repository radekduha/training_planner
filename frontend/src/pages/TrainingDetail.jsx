import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { fetchMeta } from "../api/meta.js";
import { assignTrainingSlot, fetchTraining, patchTraining } from "../api/trainings.js";
import FormField from "../components/FormField.jsx";
import PageHeader from "../components/PageHeader.jsx";
import useRealtimeInvalidate from "../hooks/useRealtimeInvalidate.js";

const formatDateTime = (value) => {
  if (!value) {
    return "--";
  }
  return new Date(value).toLocaleString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const percent = (value) => `${Math.round((value || 0) * 1000) / 10} %`;

const sortSlots = (a, b) => {
  if ((b.match_percent || 0) !== (a.match_percent || 0)) {
    return (b.match_percent || 0) - (a.match_percent || 0);
  }
  return new Date(a.slot.start_datetime).getTime() - new Date(b.slot.start_datetime).getTime();
};

const groupMatchesByTrainer = (matches = []) => {
  const byTrainer = new Map();
  matches.forEach((match) => {
    const key = match.trainer.id;
    if (!byTrainer.has(key)) {
      byTrainer.set(key, {
        trainer: match.trainer,
        slots: [],
      });
    }
    byTrainer.get(key).slots.push(match);
  });

  const groups = Array.from(byTrainer.values()).map((group) => {
    const slots = [...group.slots].sort(sortSlots);
    return {
      trainer: group.trainer,
      best: slots[0],
      additional: slots.slice(1),
    };
  });

  groups.sort((a, b) => sortSlots(a.best, b.best));
  return groups;
};

const TrainingDetail = () => {
  const { id } = useParams();
  const [training, setTraining] = useState(null);
  const [recommendations, setRecommendations] = useState({ matches: [] });
  const [meta, setMeta] = useState({ status_choices: [] });
  const [formState, setFormState] = useState({
    status: "",
    customer_name: "",
    assignment_reason: "",
    notes: "",
    updated_at: "",
  });
  const [expandedTrainers, setExpandedTrainers] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [conflictHint, setConflictHint] = useState(false);

  const loadTraining = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTraining(id);
      setTraining(data.item);
      setRecommendations(data.recommendations || { matches: [] });
      setFormState({
        status: data.item.status || "open",
        customer_name: data.item.customer_name || "",
        assignment_reason: data.item.assignment_reason || "",
        notes: data.item.notes || "",
        updated_at: data.item.updated_at || "",
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMeta()
      .then((data) => {
        setMeta({ status_choices: data.status_choices || [] });
      })
      .catch(() => {});
    loadTraining();
  }, [loadTraining]);

  useRealtimeInvalidate(
    useCallback(() => {
      loadTraining();
    }, [loadTraining])
  );

  useEffect(() => {
    setExpandedTrainers(new Set());
  }, [recommendations]);

  const groupedMatches = useMemo(
    () => groupMatchesByTrainer(recommendations.matches || []),
    [recommendations.matches]
  );

  const onChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    setConflictHint(false);
    try {
      await patchTraining(id, {
        status: formState.status,
        customer_name: formState.customer_name,
        assignment_reason: formState.assignment_reason,
        notes: formState.notes,
        updated_at: formState.updated_at,
      });
      await loadTraining();
    } catch (err) {
      setFormError(err.message);
      if (err.status === 409) {
        setConflictHint(true);
        await loadTraining();
      }
    } finally {
      setSaving(false);
    }
  };

  const onAssign = async (match) => {
    setSaving(true);
    setFormError(null);
    setConflictHint(false);
    try {
      const fairness = match.fairness || {};
      const reasonParts = [
        ...(match.reasons || []),
        `Offered days ${fairness.offered_days ?? 0}, delivered days ${fairness.delivered_days ?? 0}`,
      ];
      await assignTrainingSlot(id, {
        slot_id: match.slot.id,
        assignment_reason: reasonParts.join(" | "),
        updated_at: formState.updated_at,
      });
      await loadTraining();
    } catch (err) {
      setFormError(err.message);
      if (err.status === 409) {
        setConflictHint(true);
        await loadTraining();
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleTrainerExpansion = (trainerId) => {
    setExpandedTrainers((prev) => {
      const next = new Set(prev);
      if (next.has(trainerId)) {
        next.delete(trainerId);
      } else {
        next.add(trainerId);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <section className="stack">
        <p className="muted">Načítání detailu poptávky...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="stack">
        <div className="card">
          <h2>Detail poptávky</h2>
          <p className="error">{error}</p>
          <Link className="btn" to="/trainings">
            Zpět na poptávky
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
        title={`Poptávka #${training.id}`}
        subtitle={`${training.training_type?.name || "Téma"} / ${training.status_label}`}
        actions={
          <Link className="btn btn-ghost" to={`/trainings/${training.id}/edit`}>
            Upravit poptávku
          </Link>
        }
      />

      <div className="grid two">
        <div className="stack">
          <div className="card">
            <h3>Detail</h3>
            <div className="detail-list">
              <div>
                <span className="muted">Téma</span>
                <strong>{training.training_type?.name || "--"}</strong>
              </div>
              <div>
                <span className="muted">Organizace</span>
                <strong>{training.customer_name || "--"}</strong>
              </div>
              <div>
                <span className="muted">Lokalita</span>
                <strong>{training.address || "--"}</strong>
              </div>
              <div>
                <span className="muted">Časové okno od</span>
                <strong>{formatDateTime(training.request_window_start)}</strong>
              </div>
              <div>
                <span className="muted">Časové okno do</span>
                <strong>{formatDateTime(training.request_window_end)}</strong>
              </div>
              <div>
                <span className="muted">Přiřazený trenér</span>
                <strong>
                  {training.assigned_trainer?.display_name || training.assigned_trainer?.name || "--"}
                </strong>
              </div>
              <div>
                <span className="muted">Přiřazený slot</span>
                <strong>
                  {training.assigned_slot
                    ? `${formatDateTime(training.assigned_slot.start_datetime)} -> ${formatDateTime(
                        training.assigned_slot.end_datetime
                      )}`
                    : "--"}
                </strong>
              </div>
              <div>
                <span className="muted">Stav</span>
                <strong>{training.status_label}</strong>
              </div>
              <div>
                <span className="muted">Důvod přiřazení</span>
                <strong>{training.assignment_reason || "--"}</strong>
              </div>
            </div>
          </div>

          <div className="card">
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

              <FormField label="Organizace" htmlFor="customer_name">
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
              {conflictHint ? (
                <div className="inline-actions">
                  <p className="muted">Data se mezitím změnila. Kandidáti jsou obnovení.</p>
                  <button className="btn btn-ghost" type="button" onClick={loadTraining}>
                    Obnovit kandidáty
                  </button>
                </div>
              ) : null}

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
        </div>

        <div className="card">
          <h3>Doporučení trenér + slot</h3>
          {groupedMatches.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Trenér</th>
                    <th>Nejlepší slot</th>
                    <th>Shoda</th>
                    <th>Proč</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {groupedMatches.map((group) => {
                    const best = group.best;
                    const expanded = expandedTrainers.has(group.trainer.id);
                    return (
                      <Fragment key={`group-${group.trainer.id}`}>
                        <tr key={`trainer-${group.trainer.id}`}>
                          <td>{group.trainer.display_name || group.trainer.name}</td>
                          <td>
                            {formatDateTime(best.slot.start_datetime)}
                            {" -> "}
                            {formatDateTime(best.slot.end_datetime)}
                          </td>
                          <td>{Math.round(best.match_percent)} %</td>
                          <td>
                            {(best.reasons || []).map((reason) => (
                              <div key={reason}>{reason}</div>
                            ))}
                            {best.fairness ? (
                              <div className="muted">
                                Offered {best.fairness.offered_days}, delivered {best.fairness.delivered_days},
                                cíl {percent(best.fairness.target_share)}, aktuálně {percent(best.fairness.actual_share)}
                              </div>
                            ) : null}
                          </td>
                          <td>
                            <div className="inline-actions">
                              <button className="btn btn-ghost" type="button" onClick={() => onAssign(best)}>
                                Přiřadit
                              </button>
                              {group.additional.length ? (
                                <button
                                  className="btn btn-ghost"
                                  type="button"
                                  onClick={() => toggleTrainerExpansion(group.trainer.id)}
                                >
                                  {expanded
                                    ? "Skrýt další sloty"
                                    : `Další sloty (${group.additional.length})`}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                        {expanded
                          ? group.additional.map((slotMatch) => (
                              <tr key={`slot-${group.trainer.id}-${slotMatch.slot.id}`}>
                                <td className="muted">Další slot</td>
                                <td>
                                  {formatDateTime(slotMatch.slot.start_datetime)}
                                  {" -> "}
                                  {formatDateTime(slotMatch.slot.end_datetime)}
                                </td>
                                <td>{Math.round(slotMatch.match_percent)} %</td>
                                <td className="muted">Stejný trenér, alternativní čas.</td>
                                <td>
                                  <button
                                    className="btn btn-ghost"
                                    type="button"
                                    onClick={() => onAssign(slotMatch)}
                                  >
                                    Přiřadit
                                  </button>
                                </td>
                              </tr>
                            ))
                          : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">Žádný kandidát aktuálně nesplňuje požadavky tématu a časového okna.</p>
          )}
        </div>
      </div>
    </section>
  );
};

export default TrainingDetail;
