import { useState } from "react";
import Modal from "../common/Modal.jsx";
import { useDiagramExport } from "../../editor/DiagramExportContext.jsx";
import { createPdfFromJpegDataUrl, downloadBlob, downloadDataUrl } from "../../utils/visualExport.js";
import { safeFilename } from "../../utils/download.js";

export default function DiagramExportModal({ open, onClose, documentName }) {
  const { capture } = useDiagramExport();
  const [format, setFormat] = useState("png");
  const [area, setArea] = useState("content");
  const [resolution, setResolution] = useState(2);
  const [includeGrid, setIncludeGrid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const runExport = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await capture({
        area,
        pixelRatio: Number(resolution),
        includeGrid: area === "viewport" ? includeGrid : false,
        mimeType: format === "pdf" ? "image/jpeg" : "image/png",
        quality: 0.94,
      });
      const base = safeFilename(documentName || "diagrama");
      if (format === "pdf") {
        const pdf = createPdfFromJpegDataUrl(
          result.dataUrl,
          result.width,
          result.height,
        );
        downloadBlob(`${base}.pdf`, pdf);
      } else {
        downloadDataUrl(`${base}.png`, result.dataUrl);
      }
      onClose?.();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose?.()}
      title="Exportar vista del diagrama"
      subtitle="Imagen o documento PDF"
      size="medium"
    >
      <div className="diagram-export-layout">
        <section className="export-preview-card">
          <div className="export-preview-sheet">
            <span>GD</span>
            <strong>{documentName || "Diagrama"}</strong>
            <small>{area === "content" ? "Contenido completo" : "Vista actual"}</small>
          </div>
          <p>La selección, los puertos de conexión y los controles del editor no se incluyen en el archivo.</p>
        </section>

        <section className="export-options">
          <label className="property-field">
            <span>Formato</span>
            <div className="export-choice-row">
              <button type="button" className={format === "png" ? "active" : ""} onClick={() => setFormat("png")}>PNG</button>
              <button type="button" className={format === "pdf" ? "active" : ""} onClick={() => setFormat("pdf")}>PDF</button>
            </div>
          </label>

          <label className="property-field">
            <span>Área de exportación</span>
            <select value={area} onChange={(event) => setArea(event.target.value)}>
              <option value="content">Todo el contenido del diagrama</option>
              <option value="viewport">Sólo la vista visible</option>
            </select>
          </label>

          <label className="property-field">
            <span>Resolución</span>
            <select value={resolution} onChange={(event) => setResolution(Number(event.target.value))}>
              <option value={1}>Normal · 1×</option>
              <option value={2}>Alta · 2×</option>
              <option value={3}>Muy alta · 3×</option>
            </select>
          </label>

          <label className={`export-grid-option ${area !== "viewport" ? "export-grid-option--disabled" : ""}`}>
            <input
              type="checkbox"
              checked={includeGrid}
              disabled={area !== "viewport"}
              onChange={(event) => setIncludeGrid(event.target.checked)}
            />
            <span>
              <strong>Incluir cuadrícula</strong>
              <small>Disponible cuando se exporta la vista visible.</small>
            </span>
          </label>
        </section>
      </div>

      {error && <div className="export-error">{error}</div>}

      <div className="modal-actions modal-actions--single">
        <button className="button button--ghost" type="button" disabled={busy} onClick={onClose}>Cancelar</button>
        <button className="button button--primary" type="button" disabled={busy} onClick={runExport}>
          {busy ? <><span className="inline-spinner" /> Preparando…</> : `Exportar ${format.toUpperCase()}`}
        </button>
      </div>
    </Modal>
  );
}
