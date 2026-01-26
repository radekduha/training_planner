import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { bulkDeleteTrainers, fetchTrainers, importTrainers } from "../api/trainers.js";
import PageHeader from "../components/PageHeader.jsx";

const TrainersList = () => {
  const [trainers, setTrainers] = useState([]);
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

  const loadTrainers = () => {
    setLoading(true);
    setError(null);
    setBulkError(null);
    fetchTrainers()
      .then((data) => {
        setTrainers(data.items || []);
        setSelectedIds(new Set());
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTrainers();
  }, []);

  useEffect(() => {
    if (!selectAllRef.current) {
      return;
    }
    const isAllSelected = trainers.length > 0 && selectedIds.size === trainers.length;
    selectAllRef.current.indeterminate =
      selectedIds.size > 0 && !isAllSelected && trainers.length > 0;
  }, [selectedIds, trainers]);

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
      const data = await importTrainers({ csv, dry_run: dryRun });
      setImportResult(data);
      if (!dryRun && data.summary?.imported) {
        loadTrainers();
      }
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const toggleSelectAll = () => {
    setBulkError(null);
    setSelectedIds((prev) => {
      if (trainers.length === 0) {
        return new Set();
      }
      if (prev.size === trainers.length) {
        return new Set();
      }
      return new Set(trainers.map((item) => item.id));
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
    if (!window.confirm(`Opravdu chcete smazat ${count} vybraných trenérů?`)) {
      return;
    }
    setBulkDeleting(true);
    setBulkError(null);
    try {
      await bulkDeleteTrainers({ ids: Array.from(selectedIds) });
      loadTrainers();
    } catch (err) {
      setBulkError(err.message);
    } finally {
      setBulkDeleting(false);
    }
  };

  const isAllSelected = trainers.length > 0 && selectedIds.size === trainers.length;

  return (
    <section className="stack">
      <PageHeader
        title="Trenéři"
        subtitle="Seznam dostupných trenérů."
        actions={
          <>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setIsImportOpen(true)}
            >
              CSV import
            </button>
            <Link className="btn btn-primary" to="/trainers/new">
              Přidat trenéra
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
              <h3 id="csv-import-title">Import trenérů (CSV)</h3>
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
              Povinné sloupce: jméno, příjmení, adresa. Volitelné: titul před/za,
              AKRIS, zavolat před školením, frekvence, limit vzdálenosti, poznámka k
              limitu, e-mail, telefon, souřadnice, sazby, poznámky.
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
      <div className="stack">
        <div className="card">
          {loading ? (
            <p className="muted">Načítání trenérů...</p>
          ) : error ? (
            <p className="error">{error}</p>
          ) : trainers.length ? (
            <>
              <div className="bulk-actions">
                <div className="bulk-select">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className="table-checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    aria-label="Vybrat všechny trenéry"
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
                      <th>Jméno</th>
                      <th>Kontakt</th>
                      <th>Počet přiřazených školení</th>
                      <th>Nejbližší přiřazené školení</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainers.map((trainer) => (
                      <tr key={trainer.id}>
                        <td className="col-select">
                          <input
                            type="checkbox"
                            className="table-checkbox"
                            checked={selectedIds.has(trainer.id)}
                            onChange={() => toggleSelection(trainer.id)}
                            aria-label={`Vybrat trenéra ${trainer.display_name || trainer.name}`}
                          />
                        </td>
                        <td>
                          <Link className="text-link" to={`/trainers/${trainer.id}`}>
                            {trainer.display_name || trainer.name}
                          </Link>
                        </td>
                        <td>{trainer.email || "--"}</td>
                        <td>{trainer.assigned_trainings_count ?? 0}</td>
                        <td>
                          {trainer.next_assigned_training ? (
                            <>
                              {trainer.next_assigned_training.training_type?.name || "Školení"} (
                              {new Date(
                                trainer.next_assigned_training.start_datetime
                              ).toLocaleString()}
                              )
                            </>
                          ) : (
                            "--"
                          )}
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
                <h3>Zatím žádní trenéři</h3>
                <p>Přidej trenéry a začni dostávat doporučení.</p>
              </div>
              <Link className="btn" to="/trainers/new">
                Vytvořit trenéra
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default TrainersList;
