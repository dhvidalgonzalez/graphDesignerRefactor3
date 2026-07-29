import { useMemo } from "react";
import Modal from "../common/Modal.jsx";
import FieldInput from "../common/FieldInput.jsx";
import { getSymbolDefinition } from "../../domain/catalog/symbolCatalog.js";
import { LINE_ELECTRICAL_FIELDS } from "../../domain/electrical/electricalFields.js";
import { getParameterMetadata } from "../../domain/electrical/parameterValue.js";
import { getVoltageLevels } from "../../domain/electrical/voltageLevels.js";
import { shallowEqual, useEditorActions, useEditorSelector } from "../../editor/EditorContext.jsx";

const SOURCE_OPTIONS = [
  { value: "DEFAULT", label: "Predeterminado" },
  { value: "USER", label: "Ingresado por usuario" },
  { value: "CATALOG", label: "Catálogo" },
  { value: "IMPORTED", label: "Importado" },
  { value: "CALCULATED", label: "Calculado" },
];

const STATUS_OPTIONS = [
  { value: "MISSING", label: "Faltante" },
  { value: "ASSUMED", label: "Asumido" },
  { value: "CONFIRMED", label: "Confirmado" },
];

function groupFields(fields) {
  return fields.reduce((groups, field) => {
    const section = field.section ?? "Propiedades";
    groups[section] = [...(groups[section] ?? []), field];
    return groups;
  }, {});
}

export default function ElectricalPropertiesModal() {
  const data = useEditorSelector((state) => ({
    editor: state.ui.electricalEditor,
    document: state.document,
  }), shallowEqual);
  const actions = useEditorActions();
  const voltageLevels = getVoltageLevels(data.document.metadata);
  const entity = data.editor?.kind === "node"
    ? data.document.nodes[data.editor.id]
    : data.editor?.kind === "edge"
      ? data.document.edges[data.editor.id]
      : null;

  const descriptor = useMemo(() => {
    if (!entity || !data.editor) return null;
    if (data.editor.kind === "node") {
      const definition = getSymbolDefinition(entity.type);
      return {
        title: entity.properties.name || definition.displayName,
        subtitle: definition.displayName,
        fields: definition.electricalFields,
      };
    }
    if (entity.kind !== "line") return null;
    return {
      title: entity.properties.name || "Línea eléctrica",
      subtitle: "Componente de red",
      fields: LINE_ELECTRICAL_FIELDS,
    };
  }, [data.editor, entity]);

  if (!descriptor || !entity) return null;
  const grouped = groupFields(descriptor.fields);

  const markConfirmed = (field, source = "USER") => {
    actions.updateElectricalParameterMetadata(data.editor.kind, entity.id, field.key, {
      source,
      status: "CONFIRMED",
    });
  };

  const commit = (field, value) => {
    if (field.type === "voltage") {
      if (data.editor.kind === "node") actions.setNodeVoltage(entity.id, field.key, value);
      else actions.setEdgeVoltage(entity.id, value);
      markConfirmed(field);
      return;
    }
    if (data.editor.kind === "node") {
      actions.updateNodeElectricalParameter(entity.id, field.key, value);
    } else {
      actions.updateEdgeElectricalParameter(entity.id, field.key, value);
    }
  };

  const createAndAssignVoltage = (field, value) => {
    const createdId = data.editor.kind === "node"
      ? actions.createAndSetNodeVoltage(entity.id, field.key, value)
      : actions.createAndSetEdgeVoltage(entity.id, value);
    if (createdId) markConfirmed(field);
    return createdId;
  };

  return (
    <Modal open title={descriptor.title} subtitle={descriptor.subtitle} onClose={actions.closeElectricalEditor} size="large">
      <div className="electrical-modal-summary">
        <div><span>Identificador estable</span><code>{entity.id}</code></div>
        {data.editor.kind === "edge" && (
          <div>
            <span>Extremos</span>
            <strong>
              {data.document.nodes[entity.source.nodeId]?.properties.name}
              {" → "}
              {data.document.nodes[entity.target.nodeId]?.properties.name}
            </strong>
          </div>
        )}
      </div>

      <div className="parameter-trace-help">
        <strong>Trazabilidad de parámetros</strong>
        <span>Cada valor conserva su procedencia y si está faltante, asumido o confirmado. Los cambios manuales se marcan automáticamente como confirmados.</span>
      </div>

      <div className="electrical-form-grid">
        {Object.entries(grouped).map(([section, fields]) => (
          <section className="electrical-section" key={section}>
            <h3>{section}</h3>
            {fields.map((field) => {
              const metadata = getParameterMetadata(entity, field.key);
              return (
                <div className="parameter-field-card" key={field.key}>
                  <label className="property-field">
                    <span>{field.label}</span>
                    <FieldInput
                      field={field}
                      value={entity.properties[field.key]}
                      voltageLevels={voltageLevels}
                      onManageVoltage={actions.openVoltageLevels}
                      onCreateVoltage={(value) => createAndAssignVoltage(field, value)}
                      onCommit={(value) => commit(field, value)}
                    />
                  </label>
                  <div className="parameter-trace-row">
                    <label>
                      <span>Procedencia</span>
                      <select
                        value={metadata.source}
                        onChange={(event) => actions.updateElectricalParameterMetadata(
                          data.editor.kind,
                          entity.id,
                          field.key,
                          { source: event.target.value },
                        )}
                      >
                        {SOURCE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Estado</span>
                      <select
                        value={metadata.status}
                        onChange={(event) => actions.updateElectricalParameterMetadata(
                          data.editor.kind,
                          entity.id,
                          field.key,
                          { status: event.target.value },
                        )}
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>
      <div className="modal-actions modal-actions--single">
        <button className="button button--primary" onClick={actions.closeElectricalEditor}>Listo</button>
      </div>
    </Modal>
  );
}
