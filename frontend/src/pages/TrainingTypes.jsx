import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  createTrainingType,
  bulkDeleteTrainingTypes,
  deleteTrainingType,
  fetchTrainingTypes,
  importTrainingTypeMetrics,
  importTrainingTypes,
  updateTrainingType,
} from "../api/trainingTypes.js";
import FormField from "../components/FormField.jsx";
import PageHeader from "../components/PageHeader.jsx";

const sortTypes = (items) => [...items].sort((a, b) => a.name.localeCompare(b.name));

const getErrorMessage = (err) =>
  err?.payload?.errors?.name?.[0]?.message || err?.payload?.error || err?.message || "Něco se pokazilo.";

const TrainingTypes = () => {
  const [types, setTypes] = useState([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [listError, setListError] = useState(null);
  const [createError, setCreateError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [rowErrors, setRowErrors] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkError, setBulkError] = useState(null);
  const selectAllRef = useRef(null);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [dryRun, setDryRun] = useState(true);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [metricsFile, setMetricsFile] = useState(null);
  const [metricsImporting, setMetricsImporting] = useState(false);
  const [metricsError, setMetricsError] = useState(null);
  const [metricsResult, setMetricsResult] = useState(null);
  const [metricsDryRun, setMetricsDryRun] = useState(true);
  const [isMetricsOpen, setIsMetricsOpen] = useState(false);

  const loadTypes = () => {
    setLoading(true);
    setListError(null);
    fetchTrainingTypes()
      .then((data) => {
        setTypes(sortTypes(data.items || []));
        setSelectedIds(new Set());
        setBulkError(null);
      })
      .catch((err) => setListError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTypes();
  }, []);

  useEffect(() => {
    if (!selectAllRef.current) {
      return;
    }
    const isAllSelected = types.length > 0 && selectedIds.size === types.length;
    selectAllRef.current.indeterminate =
      selectedIds.size > 0 && !isAllSelected && types.length > 0;
  }, [selectedIds, types]);

  const onFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setImportFile(file);
    setImportError(null);
    setImportResult(null);
  };

  const onMetricsFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setMetricsFile(file);
    setMetricsError(null);
    setMetricsResult(null);
  };

  const onImport = async () => {
    if (!importFile) {
      setImportError("Vyberte CSV soubor.");
      return;
    }
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const csv = await importFile.text();
      const data = await importTrainingTypes({ csv, dry_run: dryRun });
      setImportResult(data);
      if (!dryRun && data.summary?.imported) {
        loadTypes();
      }
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const onMetricsImport = async () => {
    if (!metricsFile) {
      setMetricsError("Vyberte CSV soubor.");
      return;
    }
    setMetricsImporting(true);
    setMetricsError(null);
    setMetricsResult(null);
    try {
      const csv = await metricsFile.text();
      const data = await importTrainingTypeMetrics({ csv, dry_run: metricsDryRun });
      setMetricsResult(data);
      if (!metricsDryRun && data.summary?.imported) {
        loadTypes();
      }
    } catch (err) {
      setMetricsError(err.message);
    } finally {
      setMetricsImporting(false);
    }
  };

  const toggleSelectAll = () => {
    setBulkError(null);
    setSelectedIds((prev) => {
      if (types.length === 0) {
        return new Set();
      }
      if (prev.size === types.length) {
        return new Set();
      }
      return new Set(types.map((item) => item.id));
    });
  };

  const toggleSelection = (id) => {
    setBulkError(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const onBulkDelete = async () => {
    if (!selectedIds.size) {
      return;
    }
    const count = selectedIds.size;
    if (!window.confirm(`Opravdu chcete smazat ${count} vybraných typů školení?`)) {
      return;
    }
    setBulkDeleting(true);
    setBulkError(null);
    try {
      const data = await bulkDeleteTrainingTypes({ ids: Array.from(selectedIds) });
      if (data.summary?.blocked) {
        setBulkError(
          `Nelze smazat ${data.summary.blocked} typů, protože jsou použité ve školeních.`
        );
      }
      loadTypes();
    } catch (err) {
      setBulkError(err.message);
    } finally {
      setBulkDeleting(false);
    }
  };

  const isAllSelected = types.length > 0 && selectedIds.size === types.length;

  const onSubmit = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setCreateError("Zadejte název.");
      return;
    }
    setSaving(true);
    setCreateError(null);
    try {
      const data = await createTrainingType({ name: trimmed });
      setTypes((prev) => sortTypes([...prev, data.item]));
      setName("");
    } catch (err) {
      setCreateError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (type) => {
    setEditingId(type.id);
    setEditingName(type.name);
    setRowErrors((prev) => ({ ...prev, [type.id]: null }));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const handleUpdate = async (id) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setRowErrors((prev) => ({ ...prev, [id]: "Název je povinný." }));
      return;
    }
    setSavingId(id);
    setRowErrors((prev) => ({ ...prev, [id]: null }));
    try {
      const data = await updateTrainingType(id, { name: trimmed });
      setTypes((prev) => sortTypes(prev.map((item) => (item.id === id ? data.item : item))));
      setEditingId(null);
      setEditingName("");
    } catch (err) {
      setRowErrors((prev) => ({ ...prev, [id]: getErrorMessage(err) }));
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (type) => {
    if (!window.confirm(`Opravdu chcete smazat typ školení „${type.name}“?`)) {
      return;
    }
    setDeletingId(type.id);
    setRowErrors((prev) => ({ ...prev, [type.id]: null }));
    try {
      await deleteTrainingType(type.id);
      setTypes((prev) => prev.filter((item) => item.id !== type.id));
      if (editingId === type.id) {
        setEditingId(null);
        setEditingName("");
      }
    } catch (err) {
      setRowErrors((prev) => ({ ...prev, [type.id]: getErrorMessage(err) }));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="stack">
      <PageHeader
        title="Typy školení"
        subtitle="Spravujte kategorie školení."
        actions={
          <>
            <button className="btn btn-ghost" type="button" onClick={() => setIsMetricsOpen(true)}>
              Import hodin a studentů
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setIsImportOpen(true)}
            >
              Import lektorů
            </button>
          </>
        }
      />
      {isMetricsOpen ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setIsMetricsOpen(false)}
        >
          <div
            className="modal card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="csv-metrics-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h3 id="csv-metrics-title">Import hodin a studentů (CSV)</h3>
              <button
                className="btn btn-ghost btn-icon"
                type="button"
                onClick={() => setIsMetricsOpen(false)}
                aria-label="Zavřít"
              >
                x
              </button>
            </div>
            <p className="muted">
              Povinný sloupec: lecture_name. Volitelné: hours, students. Typ školení
              musí existovat, jinak se řádek přeskočí.
            </p>
            <div className="stack">
              <input type="file" accept=".csv,text/csv" onChange={onMetricsFileChange} />
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={metricsDryRun}
                  onChange={(event) => setMetricsDryRun(event.target.checked)}
                />
                Pouze kontrola (bez uložení)
              </label>
              <button
                className="btn"
                type="button"
                onClick={onMetricsImport}
                disabled={metricsImporting}
              >
                {metricsImporting ? "Importuji..." : "Importovat"}
              </button>
            </div>
            {metricsError ? <p className="error">{metricsError}</p> : null}
            {metricsResult ? (
              <div className="stack">
                <p className="muted">
                  {metricsResult.dry_run ? "Kontrola dokončena." : "Import dokončen."}
                </p>
                <div className="pill-row">
                  <span className="pill">Řádků: {metricsResult.summary?.total_rows ?? 0}</span>
                  <span className="pill">
                    Importováno: {metricsResult.summary?.imported ?? 0}
                  </span>
                  <span className="pill">
                    Přeskočeno: {metricsResult.summary?.skipped ?? 0}
                  </span>
                  <span className="pill">Chyby: {metricsResult.summary?.errors ?? 0}</span>
                </div>
                {metricsResult.errors?.length ? (
                  <div className="error">
                    {metricsResult.errors.slice(0, 10).map((item) => (
                      <div key={`row-${item.row}`}>
                        Řádek {item.row}:{" "}
                        {(item.errors || [])
                          .map((err) => `${err.field}: ${err.message}`)
                          .join(", ")}
                      </div>
                    ))}
                    {metricsResult.errors.length > 10 ? (
                      <div>Další chyby: {metricsResult.errors.length - 10}</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {isImportOpen ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setIsImportOpen(false)}
        >
          <div
            className="modal card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="csv-import-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h3 id="csv-import-title">Import lektorů k typům školení (CSV)</h3>
              <button
                className="btn btn-ghost btn-icon"
                type="button"
                onClick={() => setIsImportOpen(false)}
                aria-label="Zavřít"
              >
                x
              </button>
            </div>
            <p className="muted">
              Povinné sloupce: lecture_name, first_name, last_name. Volitelné: prefix,
              suffix. Lektor musí existovat v aplikaci, jinak se řádek přeskočí.
            </p>
            <div className="stack">
              <input type="file" accept=".csv,text/csv" onChange={onFileChange} />
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(event) => setDryRun(event.target.checked)}
                />
                Pouze kontrola (bez uložení)
              </label>
              <button className="btn" type="button" onClick={onImport} disabled={importing}>
                {importing ? "Importuji..." : "Importovat"}
              </button>
            </div>
            {importError ? <p className="error">{importError}</p> : null}
            {importResult ? (
              <div className="stack">
                <p className="muted">
                  {importResult.dry_run ? "Kontrola dokončena." : "Import dokončen."}
                </p>
                <div className="pill-row">
                  <span className="pill">Řádků: {importResult.summary?.total_rows ?? 0}</span>
                  <span className="pill">
                    Importováno: {importResult.summary?.imported ?? 0}
                  </span>
                  <span className="pill">
                    Přeskočeno: {importResult.summary?.skipped ?? 0}
                  </span>
                  <span className="pill">Chyby: {importResult.summary?.errors ?? 0}</span>
                </div>
                {importResult.errors?.length ? (
                  <div className="error">
                    {importResult.errors.slice(0, 10).map((item) => (
                      <div key={`row-${item.row}`}>
                        Řádek {item.row}:{" "}
                        {(item.errors || [])
                          .map((err) => `${err.field}: ${err.message}`)
                          .join(", ")}
                      </div>
                    ))}
                    {importResult.errors.length > 10 ? (
                      <div>Další chyby: {importResult.errors.length - 10}</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="card">
        <div className="card-header">
          <h3>Typy školení</h3>
          <span className="muted">Celkem: {types.length}</span>
        </div>
        {types.length ? (
          <div className="bulk-actions">
            <div className="bulk-select">
              <input
                ref={selectAllRef}
                type="checkbox"
                className="table-checkbox"
                checked={isAllSelected}
                onChange={toggleSelectAll}
                aria-label="Vybrat všechny typy školení"
              />
              <span className="muted">Vybrat vše</span>
            </div>
            <div className="inline-actions">
              <span className="muted">Vybráno: {selectedIds.size}</span>
              <button
                className="btn btn-ghost btn-danger"
                type="button"
                onClick={onBulkDelete}
                disabled={!selectedIds.size || bulkDeleting}
              >
                {bulkDeleting ? "Mažu..." : "Smazat"}
              </button>
            </div>
            {bulkError ? <p className="error">{bulkError}</p> : null}
          </div>
        ) : null}
        {listError ? <p className="error">{listError}</p> : null}
        {loading ? (
          <p className="muted">Načítání typů...</p>
        ) : types.length ? (
          <ul className="training-types-list">
            {types.map((type) => {
              const isEditing = editingId === type.id;
              const rowError = rowErrors[type.id];
              return (
                <li key={type.id} className="training-type-row">
                  <div className="training-type-select">
                    <input
                      type="checkbox"
                      className="table-checkbox"
                      checked={selectedIds.has(type.id)}
                      onChange={() => toggleSelection(type.id)}
                      aria-label={`Vybrat typ školení ${type.name}`}
                    />
                  </div>
                  <div className="training-type-main">
                    {isEditing ? (
                      <>
                        <label className="sr-only" htmlFor={`training-type-${type.id}`}>
                          Název
                        </label>
                        <input
                          id={`training-type-${type.id}`}
                          value={editingName}
                          onChange={(event) => {
                            setEditingName(event.target.value);
                            if (rowErrors[type.id]) {
                              setRowErrors((prev) => ({ ...prev, [type.id]: null }));
                            }
                          }}
                          autoFocus
                        />
                      </>
                    ) : (
                      <Link className="training-type-name text-link" to={`/training-types/${type.id}`}>
                        {type.name}
                      </Link>
                    )}
                    {rowError ? <p className="error">{rowError}</p> : null}
                  </div>
                  <div className="training-type-actions">
                    {isEditing ? (
                      <>
                        <button
                          className="btn"
                          type="button"
                          onClick={() => handleUpdate(type.id)}
                          disabled={savingId === type.id || !editingName.trim()}
                        >
                          {savingId === type.id ? "Ukládám..." : "Uložit"}
                        </button>
                        <button
                          className="btn btn-ghost"
                          type="button"
                          onClick={cancelEdit}
                          disabled={savingId === type.id}
                        >
                          Zrušit
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn btn-ghost"
                          type="button"
                          onClick={() => startEdit(type)}
                          disabled={deletingId === type.id}
                        >
                          Upravit
                        </button>
                        <button
                          className="btn btn-ghost btn-danger"
                          type="button"
                          onClick={() => handleDelete(type)}
                          disabled={deletingId === type.id}
                        >
                          {deletingId === type.id ? "Mažu..." : "Smazat"}
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">Zatím žádné typy školení.</p>
        )}
      </div>
      <div className="card">
        <h3>Přidat typ</h3>
        <form onSubmit={onSubmit} className="stack">
          <FormField label="Název" htmlFor="name">
            <input
              id="name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (createError) {
                  setCreateError(null);
                }
              }}
            />
          </FormField>
          {createError ? <p className="error">{createError}</p> : null}
          <button className="btn" type="submit" disabled={saving || !name.trim()}>
            {saving ? "Ukládám..." : "Uložit"}
          </button>
        </form>
      </div>
    </section>
  );
};

export default TrainingTypes;
