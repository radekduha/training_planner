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
  request_window_start: "",
  request_window_end: "",
  status: "open",
  notes: "",
  assignment_reason: "",
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

const TrainingForm = ({ mode }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = mode === "edit";

  const [meta, setMeta] = useState({
    status_choices: [],
    training_types: [],
  });
  const [formState, setFormState] = useState(emptyForm);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const pageTitle = useMemo(() => {
    if (isEdit) {
      return `Upravit poptávku #${id}`;
    }
    return "Nová poptávka";
  }, [isEdit, id]);

  useEffect(() => {
    fetchMeta()
      .then((data) => {
        setMeta({
          status_choices: data.status_choices || [],
          training_types: data.training_types || [],
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
          request_window_start: toLocalInput(item.request_window_start),
          request_window_end: toLocalInput(item.request_window_end),
          status: item.status || "open",
          notes: item.notes || "",
          assignment_reason: item.assignment_reason || "",
          updated_at: item.updated_at || "",
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
      request_window_start: formState.request_window_start || null,
      request_window_end: formState.request_window_end || null,
      status: formState.status,
      notes: formState.notes,
      assignment_reason: formState.assignment_reason,
      updated_at: formState.updated_at || undefined,
    };

    try {
      const data = isEdit ? await updateTraining(id, payload) : await createTraining(payload);
      navigate(`/trainings/${data.item.id}`);
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
        <p className="muted">Načítání poptávky...</p>
      </section>
    );
  }

  return (
    <section className="stack">
      <PageHeader
        title={pageTitle}
        subtitle="Zadejte téma, lokalitu a časové okno. Pokud okno necháte prázdné, použije se dalších 30 dní."
        actions={
          isEdit ? (
            <Link className="btn btn-ghost" to={`/trainings/${id}`}>
              Zpět na detail
            </Link>
          ) : null
        }
      />
      <form className="card form" onSubmit={onSubmit}>
        <FormField label="Téma" htmlFor="training_type" error={fieldErrors.training_type}>
          <select
            id="training_type"
            name="training_type"
            value={formState.training_type}
            onChange={onChange}
            required
          >
            <option value="">Vyberte téma</option>
            {meta.training_types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Organizace" htmlFor="customer_name" error={fieldErrors.customer_name}>
          <input
            id="customer_name"
            name="customer_name"
            value={formState.customer_name}
            onChange={onChange}
          />
        </FormField>

        <FormField label="Lokalita (prezenčně)" htmlFor="address" error={fieldErrors.address}>
          <input id="address" name="address" value={formState.address} onChange={onChange} required />
        </FormField>

        <div className="form-grid">
          <FormField label="Okno od" htmlFor="request_window_start" error={fieldErrors.request_window_start}>
            <input
              id="request_window_start"
              name="request_window_start"
              type="datetime-local"
              value={formState.request_window_start}
              onChange={onChange}
            />
          </FormField>
          <FormField label="Okno do" htmlFor="request_window_end" error={fieldErrors.request_window_end}>
            <input
              id="request_window_end"
              name="request_window_end"
              type="datetime-local"
              value={formState.request_window_end}
              onChange={onChange}
            />
          </FormField>
        </div>

        <div className="form-grid">
          <FormField label="Souřadnice lat" htmlFor="lat" hint="Volitelné" error={fieldErrors.lat}>
            <input id="lat" name="lat" value={formState.lat} onChange={onChange} />
          </FormField>
          <FormField label="Souřadnice lng" htmlFor="lng" hint="Volitelné" error={fieldErrors.lng}>
            <input id="lng" name="lng" value={formState.lng} onChange={onChange} />
          </FormField>
        </div>

        <FormField label="Stav" htmlFor="status" error={fieldErrors.status}>
          <select id="status" name="status" value={formState.status} onChange={onChange}>
            {meta.status_choices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Poznámky" htmlFor="notes" error={fieldErrors.notes}>
          <textarea id="notes" name="notes" value={formState.notes} onChange={onChange} />
        </FormField>

        <FormField
          label="Důvod přiřazení"
          htmlFor="assignment_reason"
          hint="Volitelné. Při přiřazení ze seznamu kandidátů se doplní automaticky."
          error={fieldErrors.assignment_reason}
        >
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
            {saving ? "Ukládám..." : isEdit ? "Uložit změny" : "Uložit poptávku"}
          </button>
          <Link className="btn btn-ghost" to={isEdit ? `/trainings/${id}` : "/trainings"}>
            Zrušit
          </Link>
        </div>
      </form>
    </section>
  );
};

export default TrainingForm;
