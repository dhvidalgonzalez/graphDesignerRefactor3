import { useEffect, useMemo, useState } from "react";
import Modal from "../common/Modal.jsx";
import FieldInput from "../common/FieldInput.jsx";
import { getSymbolDefinition } from "../../domain/catalog/symbolCatalog.js";
import { LINE_ELECTRICAL_FIELDS } from "../../domain/electrical/electricalFields.js";
import { getParameterMetadata } from "../../domain/electrical/parameterValue.js";
import { getVoltageLevels } from "../../domain/electrical/voltageLevels.js";
import {
  createAnalysisResultIndex,
  formatCurrentA,
  formatPowerKw,
  formatReactivePowerKvar,
  formatResultNumber,
  getBusResultsForComponent,
  getEntityAnalysisResult,
  getAnalysisResultView,
  loadingColor,
  voltagePuColor,
} from "../../domain/analysis/analysisResults.js";
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

function analysisRows(result, connectedBuses = []) {
  if (!result) return [];
  const entries = [
    ["Estado", result.status],
    ["Barra", result.busId],
    ["Nodo de conexión", result.connectionNodeId],
    ["Tensión", result.voltageKv == null ? null : `${formatResultNumber(result.voltageKv, 3)} kV`],
    ["Tensión por unidad", result.voltagePu == null ? null : `${formatResultNumber(result.voltagePu, 5)} p.u.`],
    ["Ángulo", result.angleDeg == null ? null : `${formatResultNumber(result.angleDeg, 4)}°`],
    ["P inyección", result.activePowerInjectionKw == null ? null : formatPowerKw(result.activePowerInjectionKw)],
    ["Q inyección", result.reactivePowerInjectionKvar == null ? null : formatReactivePowerKvar(result.reactivePowerInjectionKvar)],
    ["P desde origen", result.activePowerFromKw == null ? null : formatPowerKw(result.activePowerFromKw)],
    ["Q desde origen", result.reactivePowerFromKvar == null ? null : formatReactivePowerKvar(result.reactivePowerFromKvar)],
    ["P hacia destino", result.activePowerToKw == null ? null : formatPowerKw(result.activePowerToKw)],
    ["Q hacia destino", result.reactivePowerToKvar == null ? null : formatReactivePowerKvar(result.reactivePowerToKvar)],
    ["Corriente origen", result.currentFromA == null ? null : formatCurrentA(result.currentFromA)],
    ["Corriente destino", result.currentToA == null ? null : formatCurrentA(result.currentToA)],
    ["Cargabilidad", result.loadingPercent == null ? null : `${formatResultNumber(result.loadingPercent, 3)} %`],
    ["Dirección", result.direction],
    ["Pérdidas activas", result.activeLossKw == null ? null : formatPowerKw(result.activeLossKw)],
    ["Pérdidas reactivas", result.reactiveLossKvar == null ? null : formatReactivePowerKvar(result.reactiveLossKvar)],
    ["Potencia activa", result.activePowerKw == null ? null : formatPowerKw(result.activePowerKw)],
    ["Potencia reactiva", result.reactivePowerKvar == null ? null : formatReactivePowerKvar(result.reactivePowerKvar)],
    ["Modo de control", result.controlMode],
    ["Tap", result.tapPosition],
    ["En servicio", result.inService == null ? null : result.inService ? "Sí" : "No"],
  ];
  connectedBuses.forEach((bus, index) => {
    entries.push(
      [`Barra conectada ${index + 1}`, bus.busId || bus.connectionNodeId],
      [`Tensión barra ${index + 1}`, bus.voltageKv == null ? null : `${formatResultNumber(bus.voltageKv, 3)} kV`],
      [`Tensión p.u. barra ${index + 1}`, bus.voltagePu == null ? null : `${formatResultNumber(bus.voltagePu, 5)} p.u.`],
      [`Ángulo barra ${index + 1}`, bus.angleDeg == null ? null : `${formatResultNumber(bus.angleDeg, 4)}°`],
    );
  });
  return entries.filter(([, value]) => value !== undefined && value !== null && value !== "");
}

function resultAccent(result) {
  if (!result) return "#64748b";
  if (result.voltagePu != null) return voltagePuColor(result.voltagePu, result.status);
  if (result.loadingPercent != null) return loadingColor(result.loadingPercent, result.status);
  return "#2563eb";
}

function ActiveComponentResult({ overlay, result, connectedBuses }) {
  const activeView = overlay?.result ? getAnalysisResultView(overlay.result, overlay.viewId) : null;
  if (!overlay?.result) {
    return (
      <div className="component-analysis-empty">
        <strong>No hay un análisis activo</strong>
        <span>Activa un estudio desde el panel Análisis para consultar aquí sus resultados.</span>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="component-analysis-empty">
        <strong>Sin resultado específico</strong>
        <span>El estudio activo no contiene una fila asociada a este componente.</span>
      </div>
    );
  }
  const rows = analysisRows(result, connectedBuses);
  return (
    <div className="component-analysis-result">
      <div className="component-analysis-study" style={{ borderLeftColor: resultAccent(result) }}>
        <span>Estudio activo</span>
        <strong>{overlay.study?.name || "Análisis eléctrico"}</strong>
        <small>{activeView?.label || overlay.result.analysisType}</small>
        <code>{overlay.result.studyId}</code>
      </div>
      <div className="component-analysis-grid">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <details className="component-analysis-raw">
        <summary>Ver JSON del componente</summary>
        <pre>{JSON.stringify(result, null, 2)}</pre>
      </details>
    </div>
  );
}

export default function ElectricalPropertiesModal() {
  const data = useEditorSelector((state) => ({
    editor: state.ui.electricalEditor,
    document: state.document,
    analysisOverlay: state.ui.analysisOverlay,
  }), shallowEqual);
  const actions = useEditorActions();
  const [tab, setTab] = useState("parameters");
  const voltageLevels = getVoltageLevels(data.document.metadata);
  const entity = data.editor?.kind === "node"
    ? data.document.nodes[data.editor.id]
    : data.editor?.kind === "edge"
      ? data.document.edges[data.editor.id]
      : null;

  const resultIndex = useMemo(
    () => (data.analysisOverlay?.result ? createAnalysisResultIndex(data.document, data.analysisOverlay.result, data.analysisOverlay.viewId) : null),
    [data.analysisOverlay?.result, data.analysisOverlay?.viewId, data.document],
  );
  const activeResult = resultIndex && data.editor
    ? getEntityAnalysisResult(resultIndex, data.editor.kind, data.editor.id)
    : null;
  const connectedBusResults = resultIndex && data.editor
    ? getBusResultsForComponent(resultIndex, data.editor.id)
    : [];

  useEffect(() => {
    setTab("parameters");
  }, [data.editor?.id, data.editor?.kind]);

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

      <div className="electrical-modal-tabs" role="tablist">
        <button type="button" className={tab === "parameters" ? "active" : ""} onClick={() => setTab("parameters")}>Parámetros</button>
        <button type="button" className={tab === "results" ? "active" : ""} onClick={() => setTab("results")}>
          Resultado activo {activeResult ? "●" : ""}
        </button>
      </div>

      {tab === "parameters" && (
        <>
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
        </>
      )}

      {tab === "results" && (
        <ActiveComponentResult overlay={data.analysisOverlay} result={activeResult} connectedBuses={connectedBusResults} />
      )}

      <div className="modal-actions modal-actions--single">
        <button className="button button--primary" onClick={actions.closeElectricalEditor}>Listo</button>
      </div>
    </Modal>
  );
}
