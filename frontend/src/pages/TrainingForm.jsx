import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { fetchMeta } from "../api/meta.js";
import { createTraining, fetchTraining, updateTraining } from "../api/trainings.js";
import FormField from "../components/FormField.jsx";
import PageHeader from "../components/PageHeader.jsx";

const emptyForm = {
  training_type: "",
  customer_name: "",
  address: "",
  lat: "",
  lng: "",
  start_datetime: "",
  end_datetime: "",
  status: "waiting",
  assigned_trainer: "",
  notes: "",
  assignment_reason: "",
};

const toLocalInput = (value) => {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const TrainingForm = ({ mode }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = mode === "edit";

  const [meta, setMeta] = useState({
    status_choices: [],
    training_types: [],
    trainer_choices: [],
  });
  const [formState, setFormState] = useState(emptyForm);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const pageTitle = useMemo(() => {
    if (isEdit) {
      return `Edit training #${id}`;
    }
    return "New training";
  }, [isEdit, id]);

  useEffect(() => {
    fetchMeta()
      .then((data) => {
        setMeta({
          status_choices: data.status_choices || [],
          training_types: data.training_types || [],
          trainer_choices: data.trainer_choices || [],
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) {
      return;
    }
    setLoading(true);
    fetchTraining(id)
      .then((data) => {
        const item = data.item;
        setFormState({
          training_type: item.training_type?.id || "",
          customer_name: item.customer_name || "",
          address: item.address || "",
          lat: item.lat ?? "",
          lng: item.lng ?? "",
          start_datetime: toLocalInput(item.start_datetime),
          end_datetime: toLocalInput(item.end_datetime),
          status: item.status || "waiting",
          assigned_trainer: item.assigned_trainer?.id || "",
          notes: item.notes || "",
          assignment_reason: item.assignment_reason || "",
        });
      })
      .catch((err) => {
        setFormError(err.message);
      })
      .finally(() => setLoading(false));
  }, [isEdit, id]);

  const onChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    const payload = {
      training_type: formState.training_type,
      customer_name: formState.customer_name,
      address: formState.address,
      lat: formState.lat === "" ? null : Number(formState.lat),
      lng: formState.lng === "" ? null : Number(formState.lng),
      start_datetime: formState.start_datetime,
      end_datetime: formState.end_datetime,
      status: formState.status,
      assigned_trainer: formState.assigned_trainer || null,
      notes: formState.notes,
      assignment_reason: formState.assignment_reason,
    };

    try {
      const data = isEdit
        ? await updateTraining(id, payload)
        : await createTraining(payload);
      navigate(`/trainings/${data.item.id}`);
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
        <p className="muted">Loading training...</p>
      </section>
    );
  }

  return (
    <section className="stack">
      <PageHeader
        title={pageTitle}
        subtitle="Provide details for matching the right trainer."
        actions={
          isEdit ? (
            <Link className="btn btn-ghost" to={`/trainings/${id}`}>
              Back to detail
            </Link>
          ) : null
        }
      />
      <form className="card form" onSubmit={onSubmit}>
        <FormField label="Training type" htmlFor="training_type" error={fieldErrors.training_type}>
          <select
            id="training_type"
            name="training_type"
            value={formState.training_type}
            onChange={onChange}
            required
          >
            <option value="">Select type</option>
            {meta.training_types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Customer" htmlFor="customer_name" error={fieldErrors.customer_name}>
          <input
            id="customer_name"
            name="customer_name"
            value={formState.customer_name}
            onChange={onChange}
          />
        </FormField>
        <FormField label="Address" htmlFor="address" error={fieldErrors.address}>
          <input id="address" name="address" value={formState.address} onChange={onChange} required />
        </FormField>
        <div className="form-grid">
          <FormField label="Lat" htmlFor="lat" hint="Optional" error={fieldErrors.lat}>
            <input id="lat" name="lat" value={formState.lat} onChange={onChange} />
          </FormField>
          <FormField label="Lng" htmlFor="lng" hint="Optional" error={fieldErrors.lng}>
            <input id="lng" name="lng" value={formState.lng} onChange={onChange} />
          </FormField>
        </div>
        <p className="hint">Add coordinates if you have them to improve recommendations.</p>
        <div className="form-grid">
          <FormField label="Start" htmlFor="start_datetime" error={fieldErrors.start_datetime}>
            <input
              id="start_datetime"
              name="start_datetime"
              type="datetime-local"
              value={formState.start_datetime}
              onChange={onChange}
              required
            />
          </FormField>
          <FormField label="End" htmlFor="end_datetime" error={fieldErrors.end_datetime}>
            <input
              id="end_datetime"
              name="end_datetime"
              type="datetime-local"
              value={formState.end_datetime}
              onChange={onChange}
              required
            />
          </FormField>
        </div>
        <FormField label="Status" htmlFor="status" error={fieldErrors.status}>
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
        <FormField label="Notes" htmlFor="notes" error={fieldErrors.notes}>
          <textarea id="notes" name="notes" value={formState.notes} onChange={onChange} />
        </FormField>
        <FormField label="Assignment reason" htmlFor="assignment_reason" error={fieldErrors.assignment_reason}>
          <textarea
            id="assignment_reason"
            name="assignment_reason"
            value={formState.assignment_reason}
            onChange={onChange}
          />
        </FormField>
        {formError ? <p className="error">{formError}</p> : null}
        <div className="inline-actions">
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "Saving..." : isEdit ? "Save changes" : "Save training"}
          </button>
          <Link className="btn btn-ghost" to={isEdit ? `/trainings/${id}` : "/trainings"}>
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
};

export default TrainingForm;
