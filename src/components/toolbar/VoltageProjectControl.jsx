import { useEditorActions, useEditorSelector } from "../../editor/EditorContext.jsx";
import { getActiveVoltageLevelId, getVoltageLevels } from "../../domain/electrical/voltageLevels.js";

export default function VoltageProjectControl() {
  const metadata = useEditorSelector((state) => state.document.metadata);
  const actions = useEditorActions();
  const levels = getVoltageLevels(metadata);
  const activeId = getActiveVoltageLevelId(metadata);
  const active = levels.find((level) => level.id === activeId);

  return (
    <div className="voltage-project-control">
      <span className="voltage-swatch" style={{ background: active?.color }} />
      <label>
        <span>Nivel activo</span>
        <select value={activeId ?? ""} onChange={(event) => actions.setActiveVoltageLevel(event.target.value)}>
          {levels.map((level) => <option key={level.id} value={level.id}>{level.label}</option>)}
        </select>
      </label>
      <button className="mini-button" type="button" onClick={actions.openVoltageLevels} title="Configurar niveles de voltaje">⚙</button>
    </div>
  );
}
