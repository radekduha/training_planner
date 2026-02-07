import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  createTrainingType,
  deleteTrainingType,
  fetchTrainingTypes,
  updateTrainingType,
} from "../api/trainingTypes.js";
import FormField from "../components/FormField.jsx";
import PageHeader from "../components/PageHeader.jsx";

const sortTypes = (items) => [...items].sort((a, b) => a.name.localeCompare(b.name));

const getErrorMessage = (err) =>
  err?.payload?.errors?.name?.[0]?.message ||
  err?.payload?.errors?.duration_minutes?.[0]?.message ||
  err?.payload?.error ||
  err?.message ||
  "Něco se pokazilo.";

const TrainingTypes = () => {
  const [types, setTypes] = useState([]);
  const [form, setForm] = useState({ name: "", duration_minutes: "240" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [listError, setListError] = useState(null);
  const [createError, setCreateError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editing, setEditing] = useState({ name: "", duration_minutes: "" });
  const [rowErrors, setRowErrors] = useState({});

  const loadTypes = () => {
    setLoading(true);
    setListError(null);
    fetchTrainingTypes()
      .then((data) => {
        setTypes(sortTypes(data.items || []));
      })
      .catch((err) => setListError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTypes();
  }, []);

  const onCreate = async (event) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setCreateError("Název je povinný.");
      return;
    }

    setSaving(true);
    setCreateError(null);
    try {
      const data = await createTrainingType({
        name,
        duration_minutes: Number(form.duration_minutes || 240),
      });
      setTypes((prev) => sortTypes([...prev, data.item]));
      setForm({ name: "", duration_minutes: "240" });
    } catch (err) {
      setCreateError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (type) => {
    setEditingId(type.id);
    setEditing({ name: type.name, duration_minutes: String(type.duration_minutes || 240) });
    setRowErrors((prev) => ({ ...prev, [type.id]: null }));
  };

  const saveEdit = async (id) => {
    const name = editing.name.trim();
    if (!name) {
      setRowErrors((prev) => ({ ...prev, [id]: "Název je povinný." }));
      return;
    }

    try {
      const data = await updateTrainingType(id, {
        name,
        duration_minutes: Number(editing.duration_minutes || 240),
      });
      setTypes((prev) => sortTypes(prev.map((item) => (item.id === id ? data.item : item))));
      setEditingId(null);
    } catch (err) {
      setRowErrors((prev) => ({ ...prev, [id]: getErrorMessage(err) }));
    }
  };

  const removeType = async (type) => {
    if (!window.confirm(`Opravdu chcete smazat téma „${type.name}“?`)) {
      return;
    }
    try {
      await deleteTrainingType(type.id);
      setTypes((prev) => prev.filter((item) => item.id !== type.id));
      if (editingId === type.id) {
        setEditingId(null);
      }
    } catch (err) {
      setRowErrors((prev) => ({ ...prev, [type.id]: getErrorMessage(err) }));
    }
  };

  return (
    <section className="stack">
      <PageHeader
        title="Témata školení"
        subtitle="Každé téma má fixní délku (duration), která se používá při matchingu slotů."
      />

      <div className="grid two">
        <div className="card">
          <h3>Nové téma</h3>
          <form className="stack" onSubmit={onCreate}>
            <FormField label="Název" htmlFor="new-topic-name">
              <input
                id="new-topic-name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </FormField>
            <FormField label="Délka (minuty)" htmlFor="new-topic-duration">
              <input
                id="new-topic-duration"
                type="number"
                min="30"
                step="30"
                value={form.duration_minutes}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, duration_minutes: event.target.value }))
                }
              />
            </FormField>
            {createError ? <p className="error">{createError}</p> : null}
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Ukládám..." : "Přidat téma"}
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Seznam témat</h3>
          {loading ? (
            <p className="muted">Načítání témat...</p>
          ) : listError ? (
            <p className="error">{listError}</p>
          ) : types.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Název</th>
                    <th>Délka (min)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {types.map((type) => (
                    <tr key={type.id}>
                      <td>
                        {editingId === type.id ? (
                          <input
                            value={editing.name}
                            onChange={(event) =>
                              setEditing((prev) => ({ ...prev, name: event.target.value }))
                            }
                          />
                        ) : (
                          <Link className="text-link" to={`/training-types/${type.id}`}>
                            {type.name}
                          </Link>
                        )}
                      </td>
                      <td>
                        {editingId === type.id ? (
                          <input
                            type="number"
                            min="30"
                            step="30"
                            value={editing.duration_minutes}
                            onChange={(event) =>
                              setEditing((prev) => ({ ...prev, duration_minutes: event.target.value }))
                            }
                          />
                        ) : (
                          type.duration_minutes || 240
                        )}
                      </td>
                      <td>
                        <div className="inline-actions">
                          {editingId === type.id ? (
                            <>
                              <button className="btn btn-ghost" type="button" onClick={() => saveEdit(type.id)}>
                                Uložit
                              </button>
                              <button className="btn btn-ghost" type="button" onClick={() => setEditingId(null)}>
                                Zrušit
                              </button>
                            </>
                          ) : (
                            <>
                              <button className="btn btn-ghost" type="button" onClick={() => startEdit(type)}>
                                Upravit
                              </button>
                              <button className="btn btn-ghost" type="button" onClick={() => removeType(type)}>
                                Smazat
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {types.map((type) =>
                rowErrors[type.id] ? (
                  <p key={`err-${type.id}`} className="error">
                    {type.name}: {rowErrors[type.id]}
                  </p>
                ) : null
              )}
            </div>
          ) : (
            <p className="muted">Zatím žádná témata.</p>
          )}
        </div>
      </div>
    </section>
  );
};

export default TrainingTypes;
