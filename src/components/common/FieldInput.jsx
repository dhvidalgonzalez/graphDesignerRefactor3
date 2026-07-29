import { useEffect, useState } from "react";

export default function FieldInput({ field, value, voltageLevels = [], onCommit, onManageVoltage, onCreateVoltage }) {
  const [localValue, setLocalValue] = useState(value ?? "");
  const [customVoltageOpen, setCustomVoltageOpen] = useState(false);
  const [customVoltage, setCustomVoltage] = useState("");
  useEffect(() => setLocalValue(value ?? ""), [value]);

  if (field.type === "checkbox") {
    return (
      <label className="switch-row">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onCommit(event.target.checked)} />
        <span>{Boolean(value) ? "Sí" : "No"}</span>
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <select value={value ?? ""} onChange={(event) => onCommit(event.target.value)}>
        {(field.options ?? []).map((option) => {
          const item = typeof option === "object" ? option : { value: option, label: option };
          return <option key={item.value} value={item.value}>{item.label}</option>;
        })}
      </select>
    );
  }

  if (field.type === "voltage") {
    const createAndAssign = () => {
      const parsed = Number(String(customVoltage).replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0 || !onCreateVoltage) return;
      const createdId = onCreateVoltage(parsed);
      if (createdId) {
        setCustomVoltage("");
        setCustomVoltageOpen(false);
      }
    };
    return (
      <div className="voltage-field-control">
        <div className="voltage-input-row">
          <select value={value ?? ""} onChange={(event) => onCommit(event.target.value)}>
            <option value="" disabled>Seleccionar…</option>
            {voltageLevels.map((level) => <option key={level.id} value={level.id}>{level.label}</option>)}
          </select>
          <button className="mini-button" type="button" onClick={() => setCustomVoltageOpen((current) => !current)} title="Crear y asignar un nivel nuevo">＋</button>
          <button className="mini-button" type="button" onClick={onManageVoltage} title="Configurar catálogo de niveles">⚙</button>
        </div>
        {customVoltageOpen && (
          <div className="inline-voltage-create">
            <div className="unit-input">
              <input type="number" min="0" step="0.001" value={customVoltage} placeholder="Nuevo valor" onChange={(event) => setCustomVoltage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createAndAssign(); }} />
              <span>kV</span>
            </div>
            <button type="button" className="mini-button" onClick={createAndAssign}>✓</button>
          </div>
        )}
      </div>
    );
  }

  const commit = () => {
    if (field.type === "number") {
      if (localValue === "") {
        onCommit("");
        return;
      }
      const parsed = Number(localValue);
      if (Number.isFinite(parsed)) onCommit(parsed);
      else setLocalValue(value ?? "");
    } else onCommit(String(localValue));
  };

  const common = {
    value: localValue,
    onChange: (event) => setLocalValue(event.target.value),
    onBlur: commit,
    onKeyDown: (event) => { if (event.key === "Enter" && field.type !== "textarea") event.currentTarget.blur(); },
  };

  if (field.type === "textarea") return <textarea {...common} rows={3} />;
  return (
    <div className="unit-input">
      <input type={field.type ?? "text"} min={field.min} max={field.max} step={field.step} {...common} />
      {field.unit && <span>{field.unit}</span>}
    </div>
  );
}
