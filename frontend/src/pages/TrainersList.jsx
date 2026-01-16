import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchTrainers, importTrainers } from "../api/trainers.js";
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

  const loadTrainers = () => {
    setLoading(true);
    setError(null);
    fetchTrainers()
      .then((data) => {
        setTrainers(data.items || []);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTrainers();
  }, []);

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

  return (
    <section className="stack">
      <PageHeader
        title="Trenéři"
        subtitle="Seznam dostupných trenérů."
        actions={
          <Link className="btn btn-primary" to="/trainers/new">
            Přidat trenéra
          </Link>
        }
      />
      <div className="stack">
        <div className="card">
          <h3>Import trenérů (CSV)</h3>
          <p className="muted">
            Povinné sloupce: jméno, příjmení, adresa. Volitelné: titul před/za,
            AKRIS, zavolat před tréninkem, frekvence, limit vzdálenosti, poznámka k limitu,
            e-mail, telefon, souřadnice, sazby, poznámky.
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
                <span className="pill">Importováno: {importResult.summary?.imported ?? 0}</span>
                <span className="pill">Přeskočeno: {importResult.summary?.skipped ?? 0}</span>
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
        <div className="card">
          {loading ? (
            <p className="muted">Načítání trenérů...</p>
          ) : error ? (
            <p className="error">{error}</p>
          ) : trainers.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Jméno</th>
                    <th>Kontakt</th>
                    <th>Hodinová sazba</th>
                    <th>Cestovné</th>
                  </tr>
                </thead>
                <tbody>
                  {trainers.map((trainer) => (
                    <tr key={trainer.id}>
                      <td>
                        <Link className="text-link" to={`/trainers/${trainer.id}`}>
                          {trainer.display_name || trainer.name}
                        </Link>
                      </td>
                      <td>{trainer.email || "--"}</td>
                      <td>{trainer.hourly_rate ?? "--"}</td>
                      <td>{trainer.travel_rate_km ?? "--"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
