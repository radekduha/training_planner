import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { fetchTrainingTypes } from "../api/trainingTypes.js";
import { createTrainer, fetchTrainer, updateTrainer } from "../api/trainers.js";
import FormField from "../components/FormField.jsx";
import PageHeader from "../components/PageHeader.jsx";

const weekdays = [
  { value: "0", label: "Monday" },
  { value: "1", label: "Tuesday" },
  { value: "2", label: "Wednesday" },
  { value: "3", label: "Thursday" },
  { value: "4", label: "Friday" },
  { value: "5", label: "Saturday" },
  { value: "6", label: "Sunday" },
];

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  home_address: "",
  home_lat: "",
  home_lng: "",
  hourly_rate: "",
  travel_rate_km: "",
  notes: "",
  training_types: [],
  max_distance_km: "",
  weekend_allowed: true,
  max_long_trips_per_month: "",
  preferred_weekdays: [],
};

const getRuleValue = (rules, type, fallback) => {
  const found = rules?.find((rule) => rule.type === type);
  if (!found) {
    return fallback;
  }
  return found.value ?? fallback;
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
      return `Edit trainer #${id}`;
    }
    return "New trainer";
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
        setFormState({
          name: item.name || "",
          email: item.email || "",
          phone: item.phone || "",
          home_address: item.home_address || "",
          home_lat: item.home_lat ?? "",
          home_lng: item.home_lng ?? "",
          hourly_rate: item.hourly_rate ?? "",
          travel_rate_km: item.travel_rate_km ?? "",
          notes: item.notes || "",
          training_types: item.training_types?.map((type) => String(type.id)) || [],
          max_distance_km: getRuleValue(item.rules, "max_distance_km", "") ?? "",
          weekend_allowed: getRuleValue(item.rules, "weekend_allowed", true),
          max_long_trips_per_month:
            getRuleValue(item.rules, "max_long_trips_per_month", "") ?? "",
          preferred_weekdays:
            getRuleValue(item.rules, "preferred_weekdays", [])?.map((day) => String(day)) || [],
        });
      })
      .catch((err) => setFormError(err.message))
      .finally(() => setLoading(false));
  }, [isEdit, id]);

  const onChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormState((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
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

  const toggleWeekday = (weekday) => {
    setFormState((prev) => {
      const existing = prev.preferred_weekdays;
      if (existing.includes(weekday)) {
        return { ...prev, preferred_weekdays: existing.filter((item) => item !== weekday) };
      }
      return { ...prev, preferred_weekdays: [...existing, weekday] };
    });
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    const payload = {
      name: formState.name,
      email: formState.email,
      phone: formState.phone,
      home_address: formState.home_address,
      home_lat: formState.home_lat === "" ? null : Number(formState.home_lat),
      home_lng: formState.home_lng === "" ? null : Number(formState.home_lng),
      hourly_rate: formState.hourly_rate === "" ? null : Number(formState.hourly_rate),
      travel_rate_km: formState.travel_rate_km === "" ? null : Number(formState.travel_rate_km),
      notes: formState.notes,
      training_types: formState.training_types,
      max_distance_km: formState.max_distance_km === "" ? null : Number(formState.max_distance_km),
      weekend_allowed: formState.weekend_allowed,
      max_long_trips_per_month:
        formState.max_long_trips_per_month === ""
          ? null
          : Number(formState.max_long_trips_per_month),
      preferred_weekdays: formState.preferred_weekdays,
    };

    try {
      const data = isEdit
        ? await updateTrainer(id, payload)
        : await createTrainer(payload);
      navigate(`/trainers/${data.item.id}`);
    } catch (err) {
      setFormError(err.message);
      if (err.payload?.errors) {
        const mapped = {};
        Object.entries(err.payload.errors).forEach(([key, messages]) => {
          mapped[key] = messages?.[0]?.message || "Invalid value.";
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
        <p className="muted">Loading trainer...</p>
      </section>
    );
  }

  return (
    <section className="stack">
      <PageHeader
        title={pageTitle}
        subtitle="Capture trainer details and constraints."
        actions={
          isEdit ? (
            <Link className="btn btn-ghost" to={`/trainers/${id}`}>
              Back to detail
            </Link>
          ) : null
        }
      />
      <form className="card form" onSubmit={onSubmit}>
        <FormField label="Name" htmlFor="name" error={fieldErrors.name}>
          <input id="name" name="name" value={formState.name} onChange={onChange} required />
        </FormField>
        <div className="form-grid">
          <FormField label="Email" htmlFor="email" error={fieldErrors.email}>
            <input id="email" name="email" value={formState.email} onChange={onChange} />
          </FormField>
          <FormField label="Phone" htmlFor="phone" error={fieldErrors.phone}>
            <input id="phone" name="phone" value={formState.phone} onChange={onChange} />
          </FormField>
        </div>
        <FormField label="Home address" htmlFor="home_address" error={fieldErrors.home_address}>
          <input
            id="home_address"
            name="home_address"
            value={formState.home_address}
            onChange={onChange}
            required
          />
        </FormField>
        <div className="form-grid">
          <FormField label="Home lat" htmlFor="home_lat" hint="Optional" error={fieldErrors.home_lat}>
            <input id="home_lat" name="home_lat" value={formState.home_lat} onChange={onChange} />
          </FormField>
          <FormField label="Home lng" htmlFor="home_lng" hint="Optional" error={fieldErrors.home_lng}>
            <input id="home_lng" name="home_lng" value={formState.home_lng} onChange={onChange} />
          </FormField>
        </div>
        <div className="form-grid">
          <FormField label="Hourly rate (CZK)" htmlFor="hourly_rate" error={fieldErrors.hourly_rate}>
            <input
              id="hourly_rate"
              name="hourly_rate"
              value={formState.hourly_rate}
              onChange={onChange}
            />
          </FormField>
          <FormField label="Travel rate (CZK/km)" htmlFor="travel_rate_km" error={fieldErrors.travel_rate_km}>
            <input
              id="travel_rate_km"
              name="travel_rate_km"
              value={formState.travel_rate_km}
              onChange={onChange}
            />
          </FormField>
        </div>
        <FormField label="Notes" htmlFor="notes" error={fieldErrors.notes}>
          <textarea id="notes" name="notes" value={formState.notes} onChange={onChange} />
        </FormField>
        <h3>Training types</h3>
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
        <h3>Rules</h3>
        <FormField
          label="Max distance (km)"
          htmlFor="max_distance_km"
          error={fieldErrors.max_distance_km}
        >
          <input
            id="max_distance_km"
            name="max_distance_km"
            value={formState.max_distance_km}
            onChange={onChange}
          />
        </FormField>
        <label className="toggle">
          <input
            type="checkbox"
            name="weekend_allowed"
            checked={formState.weekend_allowed}
            onChange={onChange}
          />
          Weekend allowed
        </label>
        <FormField
          label="Max long trips per month"
          htmlFor="max_long_trips_per_month"
          error={fieldErrors.max_long_trips_per_month}
        >
          <input
            id="max_long_trips_per_month"
            name="max_long_trips_per_month"
            value={formState.max_long_trips_per_month}
            onChange={onChange}
          />
        </FormField>
        <h3>Preferred weekdays</h3>
        <div className="chip-grid">
          {weekdays.map((day) => (
            <label className="chip" key={day.value}>
              <input
                type="checkbox"
                checked={formState.preferred_weekdays.includes(day.value)}
                onChange={() => toggleWeekday(day.value)}
              />
              {day.label}
            </label>
          ))}
        </div>
        {formError ? <p className="error">{formError}</p> : null}
        <div className="inline-actions">
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "Saving..." : isEdit ? "Save changes" : "Save trainer"}
          </button>
          <Link className="btn btn-ghost" to={isEdit ? `/trainers/${id}` : "/trainers"}>
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
};

export default TrainerForm;
