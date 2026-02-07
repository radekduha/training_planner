import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { fetchTrainingTypes } from "../api/trainingTypes.js";
import { createTrainer, fetchTrainer, updateTrainer } from "../api/trainers.js";
import FormField from "../components/FormField.jsx";
import PageHeader from "../components/PageHeader.jsx";

const emptyForm = {
  first_name: "",
  last_name: "",
  title_prefix: "",
  title_suffix: "",
  email: "",
  phone: "",
  home_address: "",
  home_lat: "",
  home_lng: "",
  notes: "",
  training_types: [],
  availability_slots: [],
  updated_at: "",
};

const toLocalInput = (value) => {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const TrainerForm = ({ mode }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = mode === "edit";

  const [trainingTypes, setTrainingTypes] = useState([]);
  const [formState, setFormState] = useState(emptyForm);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const pageTitle = useMemo(() => {
    if (isEdit) {
      return `Upravit trenéra #${id}`;
    }
    return "Nový trenér";
  }, [isEdit, id]);

  useEffect(() => {
    fetchTrainingTypes()
      .then((data) => setTrainingTypes(data.items || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) {
      return;
    }
    setLoading(true);
    fetchTrainer(id)
      .then((data) => {
        const item = data.item;
        const editableSlots = (item.availability_slots || []).filter(
          (slot) => !slot.assigned_training_id
        );
        setFormState({
          first_name: item.first_name || "",
          last_name: item.last_name || "",
          title_prefix: item.title_prefix || "",
          title_suffix: item.title_suffix || "",
          email: item.email || "",
          phone: item.phone || "",
          home_address: item.home_address || "",
          home_lat: item.home_lat ?? "",
          home_lng: item.home_lng ?? "",
          notes: item.notes || "",
          training_types: item.training_types?.map((type) => String(type.id)) || [],
          availability_slots: editableSlots.map((slot) => ({
            start_datetime: toLocalInput(slot.start_datetime),
            end_datetime: toLocalInput(slot.end_datetime),
            is_active: slot.is_active !== false,
          })),
          updated_at: item.updated_at || "",
        });
      })
      .catch((err) => setFormError(err.message))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const onChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const toggleTrainingType = (typeId) => {
    setFormState((prev) => {
      const existing = prev.training_types;
      if (existing.includes(typeId)) {
        return { ...prev, training_types: existing.filter((item) => item !== typeId) };
      }
      return { ...prev, training_types: [...existing, typeId] };
    });
  };

  const addSlot = () => {
    setFormState((prev) => ({
      ...prev,
      availability_slots: [
        ...prev.availability_slots,
        { start_datetime: "", end_datetime: "", is_active: true },
      ],
    }));
  };

  const removeSlot = (index) => {
    setFormState((prev) => ({
      ...prev,
      availability_slots: prev.availability_slots.filter((_, i) => i !== index),
    }));
  };

  const updateSlot = (index, key, value) => {
    setFormState((prev) => ({
      ...prev,
      availability_slots: prev.availability_slots.map((slot, i) =>
        i === index ? { ...slot, [key]: value } : slot
      ),
    }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    setFieldErrors({});

    const payload = {
      first_name: formState.first_name,
      last_name: formState.last_name,
      title_prefix: formState.title_prefix,
      title_suffix: formState.title_suffix,
      email: formState.email,
      phone: formState.phone,
      home_address: formState.home_address,
      home_lat: formState.home_lat === "" ? null : Number(formState.home_lat),
      home_lng: formState.home_lng === "" ? null : Number(formState.home_lng),
      notes: formState.notes,
      training_types: formState.training_types,
      availability_slots: formState.availability_slots
        .filter((slot) => slot.start_datetime && slot.end_datetime)
        .map((slot) => ({
          start_datetime: slot.start_datetime,
          end_datetime: slot.end_datetime,
          is_active: slot.is_active,
        })),
      updated_at: formState.updated_at || undefined,
    };

    try {
      const data = isEdit ? await updateTrainer(id, payload) : await createTrainer(payload);
      navigate(`/trainers/${data.item.id}`);
    } catch (err) {
      setFormError(err.message);
      if (err.payload?.errors) {
        const mapped = {};
        Object.entries(err.payload.errors).forEach(([key, messages]) => {
          mapped[key] = messages?.[0]?.message || "Neplatná hodnota.";
        });
        setFieldErrors(mapped);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="stack">
        <p className="muted">Načítání trenéra...</p>
      </section>
    );
  }

  return (
    <section className="stack">
      <PageHeader
        title={pageTitle}
        subtitle="Nastavte dovednosti a přesné dostupné sloty trenéra."
        actions={
          isEdit ? (
            <Link className="btn btn-ghost" to={`/trainers/${id}`}>
              Zpět na detail
            </Link>
          ) : null
        }
      />
      <form className="card form" onSubmit={onSubmit}>
        <div className="form-grid">
          <FormField label="Jméno" htmlFor="first_name" error={fieldErrors.first_name}>
            <input
              id="first_name"
              name="first_name"
              value={formState.first_name}
              onChange={onChange}
              required
            />
          </FormField>
          <FormField label="Příjmení" htmlFor="last_name" error={fieldErrors.last_name}>
            <input
              id="last_name"
              name="last_name"
              value={formState.last_name}
              onChange={onChange}
              required
            />
          </FormField>
        </div>

        <div className="form-grid">
          <FormField label="Titul před" htmlFor="title_prefix">
            <input id="title_prefix" name="title_prefix" value={formState.title_prefix} onChange={onChange} />
          </FormField>
          <FormField label="Titul za" htmlFor="title_suffix">
            <input id="title_suffix" name="title_suffix" value={formState.title_suffix} onChange={onChange} />
          </FormField>
        </div>

        <div className="form-grid">
          <FormField label="E-mail" htmlFor="email" error={fieldErrors.email}>
            <input id="email" name="email" value={formState.email} onChange={onChange} />
          </FormField>
          <FormField label="Telefon" htmlFor="phone" error={fieldErrors.phone}>
            <input id="phone" name="phone" value={formState.phone} onChange={onChange} />
          </FormField>
        </div>

        <FormField label="Adresa" htmlFor="home_address" error={fieldErrors.home_address}>
          <input
            id="home_address"
            name="home_address"
            value={formState.home_address}
            onChange={onChange}
            required
          />
        </FormField>

        <div className="form-grid">
          <FormField label="Souřadnice lat" htmlFor="home_lat" error={fieldErrors.home_lat}>
            <input id="home_lat" name="home_lat" value={formState.home_lat} onChange={onChange} />
          </FormField>
          <FormField label="Souřadnice lng" htmlFor="home_lng" error={fieldErrors.home_lng}>
            <input id="home_lng" name="home_lng" value={formState.home_lng} onChange={onChange} />
          </FormField>
        </div>

        <FormField label="Poznámky" htmlFor="notes" error={fieldErrors.notes}>
          <textarea id="notes" name="notes" value={formState.notes} onChange={onChange} />
        </FormField>

        <h3>Témata</h3>
        <div className="chip-grid">
          {trainingTypes.map((type) => (
            <label className="chip" key={type.id}>
              <input
                type="checkbox"
                checked={formState.training_types.includes(String(type.id))}
                onChange={() => toggleTrainingType(String(type.id))}
              />
              {type.name}
            </label>
          ))}
        </div>

        <h3>Dostupné sloty</h3>
        <p className="muted">Sloty slouží jako zdroj kapacity pro matching.</p>
        <div className="stack">
          {formState.availability_slots.map((slot, index) => (
            <div className="form-grid" key={`slot-${index}`}>
              <FormField label="Od" htmlFor={`slot-start-${index}`}>
                <input
                  id={`slot-start-${index}`}
                  type="datetime-local"
                  value={slot.start_datetime}
                  onChange={(event) => updateSlot(index, "start_datetime", event.target.value)}
                />
              </FormField>
              <FormField label="Do" htmlFor={`slot-end-${index}`}>
                <input
                  id={`slot-end-${index}`}
                  type="datetime-local"
                  value={slot.end_datetime}
                  onChange={(event) => updateSlot(index, "end_datetime", event.target.value)}
                />
              </FormField>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={slot.is_active}
                  onChange={(event) => updateSlot(index, "is_active", event.target.checked)}
                />
                Aktivní
              </label>
              <button className="btn btn-ghost" type="button" onClick={() => removeSlot(index)}>
                Odebrat
              </button>
            </div>
          ))}
          <div>
            <button className="btn btn-ghost" type="button" onClick={addSlot}>
              Přidat slot
            </button>
          </div>
        </div>

        {formError ? <p className="error">{formError}</p> : null}
        <div className="inline-actions">
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "Ukládám..." : isEdit ? "Uložit změny" : "Uložit trenéra"}
          </button>
          <Link className="btn btn-ghost" to={isEdit ? `/trainers/${id}` : "/trainers"}>
            Zrušit
          </Link>
        </div>
      </form>
    </section>
  );
};

export default TrainerForm;
