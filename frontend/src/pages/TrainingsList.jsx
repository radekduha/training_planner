import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { fetchMeta } from "../api/meta.js";
import { bulkDeleteTrainings, fetchTrainings, importTrainings } from "../api/trainings.js";
import PageHeader from "../components/PageHeader.jsx";

const emptyFilters = {
  status: "",
  training_type: "",
  start_date: "",
  end_date: "",
  no_trainer: false,
};

const TrainingsList = () => {
  const [filters, setFilters] = useState(emptyFilters);
  const [meta, setMeta] = useState({ status_choices: [], training_types: [] });
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [dryRun, setDryRun] = useState(true);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkError, setBulkError] = useState(null);
  const selectAllRef = useRef(null);

  const loadTrainings = async (activeFilters) => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        ...activeFilters,
        no_trainer: activeFilters.no_trainer ? "1" : "",
      };
      const data = await fetchTrainings(payload);
      setTrainings(data.items || []);
      setSelectedIds(new Set());
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
          training_types: data.training_types || [],
        });
      })
      .catch(() => {});
    loadTrainings(emptyFilters);
  }, []);

  useEffect(() => {
    if (!selectAllRef.current) {
      return;
    }
    const isAllSelected = trainings.length > 0 && selectedIds.size === trainings.length;
    selectAllRef.current.indeterminate =
      selectedIds.size > 0 && !isAllSelected && trainings.length > 0;
  }, [selectedIds, trainings]);

  const onFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setImportFile(file);
    setImportError(null);
    setImportResult(null);
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
      const data = await importTrainings({ csv, dry_run: dryRun });
      setImportResult(data);
      if (!dryRun && data.summary?.imported) {
        loadTrainings(filters);
      }
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const onFilterChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFilters((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const onSubmit = (event) => {
    event.preventDefault();
    loadTrainings(filters);
  };

  const onReset = () => {
    setFilters(emptyFilters);
    loadTrainings(emptyFilters);
  };

  const toggleSelectAll = () => {
    setBulkError(null);
    setSelectedIds((prev) => {
      if (trainings.length === 0) {
        return new Set();
      }
      if (prev.size === trainings.length) {
        return new Set();
      }
      return new Set(trainings.map((item) => item.id));
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
    if (!window.confirm(`Opravdu chcete smazat ${count} vybraných školení?`)) {
      return;
    }
    setBulkDeleting(true);
    setBulkError(null);
    try {
      await bulkDeleteTrainings({ ids: Array.from(selectedIds) });
      await loadTrainings(filters);
    } catch (err) {
      setBulkError(err.message);
    } finally {
      setBulkDeleting(false);
    }
  };

  const isAllSelected = trainings.length > 0 && selectedIds.size === trainings.length;

  return (
    <section className="stack">
      <PageHeader
        title="Školení"
        subtitle="Filtrujte a prohlížejte všechna plánovaná školení."
        actions={
          <>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setIsImportOpen(true)}
            >
              CSV import
            </button>
            <Link className="btn btn-primary" to="/trainings/new">
              Nové školení
            </Link>
          </>
        }
      />
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
              <h3 id="csv-import-title">Import školení (CSV)</h3>
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
              Povinné sloupce: start_date, training_name, start_time, end_time. Místo školení
              vyplňte přes training_place nebo payer_address. Ostatní sloupce jsou volitelné.
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
      <div className="grid">
        <div className="card">
          <h2>Filtry</h2>
          <form onSubmit={onSubmit} className="filters-form">
            <div className="filters">
              <div className="field">
                <label htmlFor="status">Stav</label>
                <select id="status" name="status" value={filters.status} onChange={onFilterChange}>
                  <option value="">Vše</option>
                  {meta.status_choices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="training_type">Typ školení</label>
                <select
                  id="training_type"
                  name="training_type"
                  value={filters.training_type}
                  onChange={onFilterChange}
                >
                  <option value="">Vše</option>
                  {meta.training_types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="start_date">Datum od</label>
                <input
                  id="start_date"
                  name="start_date"
                  type="date"
                  value={filters.start_date}
                  onChange={onFilterChange}
                />
              </div>
              <div className="field">
                <label htmlFor="end_date">Datum do</label>
                <input
                  id="end_date"
                  name="end_date"
                  type="date"
                  value={filters.end_date}
                  onChange={onFilterChange}
                />
              </div>
              <div className="filters-actions">
                <button className="btn" type="submit">
                  Použít
                </button>
                <button className="btn btn-ghost" type="button" onClick={onReset}>
                  Resetovat
                </button>
              </div>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                name="no_trainer"
                checked={filters.no_trainer}
                onChange={onFilterChange}
              />
              Bez trenéra (koncept + čeká)
            </label>
          </form>
        </div>
        <div className="card">
          {loading ? (
            <p className="muted">Načítání školení...</p>
          ) : error ? (
            <p className="error">{error}</p>
          ) : trainings.length ? (
            <>
              <div className="bulk-actions">
                <div className="bulk-select">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className="table-checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    aria-label="Vybrat všechna školení"
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
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th className="col-select"></th>
                      <th>Typ</th>
                      <th>Zákazník</th>
                      <th>Adresa</th>
                      <th>Kdy</th>
                      <th>Stav</th>
                      <th>Trenér</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainings.map((training) => (
                      <tr key={training.id}>
                        <td className="col-select">
                          <input
                            type="checkbox"
                            className="table-checkbox"
                            checked={selectedIds.has(training.id)}
                            onChange={() => toggleSelection(training.id)}
                            aria-label={`Vybrat školení ${training.training_type?.name || ""}`}
                          />
                        </td>
                        <td>{training.training_type?.name}</td>
                        <td>{training.customer_name || "--"}</td>
                        <td>{training.address}</td>
                        <td>{new Date(training.start_datetime).toLocaleString()}</td>
                        <td>
                          <span className="pill">{training.status_label}</span>
                        </td>
                        <td>
                          {training.assigned_trainer?.display_name ||
                            training.assigned_trainer?.name ||
                            "--"}
                        </td>
                        <td>
                          <Link className="text-link" to={`/trainings/${training.id}`}>
                            Detail
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div>
                <h3>Zatím žádná školení</h3>
                <p>Vytvořte první školení a začněte přiřazovat trenéry.</p>
              </div>
              <Link className="btn" to="/trainings/new">
                Přidat školení
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default TrainingsList;
