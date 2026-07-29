import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "../common/Modal.jsx";
import { useEditorActions, useEditorSelector } from "../../editor/EditorContext.jsx";
import { getVoltageLevels } from "../../domain/electrical/voltageLevels.js";

const EMPTY_FORM = { value: "", unit: "kV", color: "#0f766e", label: "" };

export default function VoltageLevelsModal() {
  const open = useEditorSelector((state) => state.ui.voltageLevelsOpen);
  const metadata = useEditorSelector((state) => state.document.metadata);
  const actions = useEditorActions();
  const levels = useMemo(() => getVoltageLevels(metadata), [metadata]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const selected = levels[0] ?? null;
      setSelectedId(selected?.id ?? null);
      setForm(selected
        ? { value: String(selected.value), unit: selected.unit, color: selected.color, label: selected.label }
        : EMPTY_FORM);
    }
    wasOpenRef.current = open;
  }, [open, levels]);

  const selectLevel = (level) => {
    setSelectedId(level.id);
    setForm({ value: String(level.value), unit: level.unit, color: level.color, label: level.label });
  };

  const newLevel = () => {
    setSelectedId(null);
    setForm(EMPTY_FORM);
  };

  const save = () => {
    const input = { value: form.value, unit: form.unit, color: form.color, label: form.label };
    if (selectedId) actions.updateVoltageLevel(selectedId, input);
    else {
      const id = actions.createVoltageLevel(input);
      if (id) setSelectedId(id);
    }
  };

  return (
    <Modal open={open} title="Niveles de voltaje del proyecto" subtitle="Catálogo común" onClose={actions.closeVoltageLevels} size="large">
      <div className="voltage-modal-layout">
        <aside className="voltage-level-list">
          <button className="button button--primary voltage-new-button" onClick={newLevel}>＋ Nuevo nivel</button>
          {levels.map((level) => (
            <button key={level.id} className={selectedId === level.id ? "active" : ""} onClick={() => selectLevel(level)}>
              <span className="voltage-swatch voltage-swatch--large" style={{ background: level.color }} />
              <span><strong>{level.label}</strong><small>{level.value} {level.unit}</small></span>
            </button>
          ))}
        </aside>

        <div className="voltage-level-form">
          <div className="form-intro">
            <h3>{selectedId ? "Editar nivel" : "Crear nivel"}</h3>
            <p>Los componentes conectados comparten este nivel hasta encontrar un transformador.</p>
          </div>
          <label className="property-field">
            <span>Valor nominal</span>
            <div className="unit-input">
              <input type="number" min="0" step="0.001" value={form.value} onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} />
              <span>{form.unit}</span>
            </div>
          </label>
          <label className="property-field">
            <span>Etiqueta</span>
            <input type="text" value={form.label} placeholder="Ej.: 13,8 kV Norte" onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} />
          </label>
          <label className="property-field">
            <span>Color del diagrama</span>
            <div className="color-field">
              <input type="color" value={form.color} onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))} />
              <code>{form.color}</code>
            </div>
          </label>
          <div className="modal-actions">
            {selectedId && <button className="button danger-outline" onClick={() => { if (actions.removeVoltageLevel(selectedId)) newLevel(); }}>Eliminar</button>}
            <span />
            <button className="button" onClick={actions.closeVoltageLevels}>Cerrar</button>
            <button className="button button--primary" onClick={save}>Guardar nivel</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
