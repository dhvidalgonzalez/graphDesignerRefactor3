import { useMemo, useState } from "react";
import { createAnalysisInputPreview, createAnalysisRequestPreview } from "../../domain/analysis/createAnalysisInput.js";
import { evaluateAnalysisReadiness } from "../../domain/analysis/analysisReadiness.js";
import { normalizeAnalysisConfiguration } from "../../domain/analysis/analysisConfiguration.js";
import { getOperatingCase, normalizeOperatingCases } from "../../domain/analysis/operatingCases.js";
import { useEditorActions, useEditorSelector } from "../../editor/EditorContext.jsx";
import { useWorkspace } from "../../workspace/WorkspaceContext.jsx";
import { downloadTextFile, safeFilename } from "../../utils/download.js";

const READINESS_LABELS = {
  NOT_READY: "No preparado",
  READY_WITH_ASSUMPTIONS: "Preparado con supuestos",
  READY: "Preparado",
};

const KIND_LABELS = {
  BUS: "Barra",
  LOAD: "Carga",
  GENERATOR: "Generador",
  EXTERNAL_GRID: "Red externa",
  LINE: "Línea",
  TRANSFORMER_2W: "Transformador 2 devanados",
  TRANSFORMER_3W: "Transformador 3 devanados",
  SWITCH: "Interruptor",
  SHUNT: "Shunt",
};

function numberOrEmpty(value) {
  return value === undefined || value === null ? "" : value;
}

function AnalysisSummary({ validation }) {
  const { statistics } = validation;
  return (
    <>
      <div className={`analysis-readiness analysis-readiness--${validation.readiness.toLowerCase()}`}>
        <span>Estado del modelo</span>
        <strong>{READINESS_LABELS[validation.readiness]}</strong>
        <small>
          {validation.errors.length} errores · {validation.warnings.length} advertencias
        </small>
      </div>
      <div className="analysis-stat-grid">
        <div><span>Barras</span><strong>{statistics.busCount}</strong></div>
        <div><span>Ramas</span><strong>{statistics.branchCount}</strong></div>
        <div><span>Cargas</span><strong>{statistics.loadCount}</strong></div>
        <div><span>Fuentes</span><strong>{statistics.generatorCount}</strong></div>
        <div><span>Nodos eléctricos</span><strong>{statistics.connectionNodeCount}</strong></div>
        <div><span>Terminales</span><strong>{statistics.terminalCount}</strong></div>
      </div>
    </>
  );
}

function IssueList({ title, items, tone }) {
  if (!items.length) return null;
  return (
    <section className={`analysis-issues analysis-issues--${tone}`}>
      <h3>{title}</h3>
      {items.map((item, index) => (
        <div className="analysis-issue" key={`${item.code}-${item.componentId ?? "general"}-${index}`}>
          <strong>{item.code}</strong>
          <span>{item.message}</span>
          {item.componentId && <code>{item.componentId}</code>}
        </div>
      ))}
    </section>
  );
}

function OverviewTab({ document, validation, activeDiagram }) {
  const cases = normalizeOperatingCases(document.operatingCases);
  const configuration = normalizeAnalysisConfiguration(document.analysisConfiguration);
  const defaultCase = cases.find((item) => item.isDefault) ?? cases[0];
  const request = createAnalysisRequestPreview(document, {
    diagramId: activeDiagram?.id ?? document.id,
    operatingCaseId: defaultCase.id,
    expectedDiagramVersion: activeDiagram?.storageVersion ?? "<storageVersion>",
  });

  return (
    <div className="analysis-tab-content">
      <AnalysisSummary validation={validation} />
      <section className="analysis-section-card">
        <h3>Solicitud preparada</h3>
        <div className="read-only-grid">
          <span>Análisis</span><strong>Flujo de carga AC balanceado</strong>
          <span>Caso por defecto</span><strong>{defaultCase.name}</strong>
          <span>Ejecución</span><strong>{configuration.defaultExecutionPreference}</strong>
          <span>Versión S3</span><strong>{activeDiagram?.storageVersion ?? "Sin sincronizar"}</strong>
          <span>Unidades</span><strong>1 unidad estándar</strong>
        </div>
        <p className="analysis-phase-note">
          Esta fase sólo prepara y valida los datos. No crea estudios ni consume unidades; la Lambda orquestadora se incorporará en la segunda fase.
        </p>
      </section>
      <IssueList title="Errores bloqueantes" items={validation.errors} tone="error" />
      <IssueList title="Advertencias y supuestos" items={validation.warnings} tone="warning" />
      <section className="analysis-section-card">
        <h3>Contrato semántico</h3>
        <pre className="analysis-code-preview">{JSON.stringify(request, null, 2)}</pre>
      </section>
    </div>
  );
}

function CaseOverrideFields({ component, value, disabled, onChange, onClear }) {
  const supportsPower = ["LOAD", "GENERATOR", "EXTERNAL_GRID"].includes(component.kind);
  const supportsVoltage = ["GENERATOR", "EXTERNAL_GRID"].includes(component.kind);
  const supportsTap = ["TRANSFORMER_2W", "TRANSFORMER_3W"].includes(component.kind);
  const supportsSwitch = component.kind === "SWITCH";

  return (
    <div className="case-override-row">
      <div className="case-component-identity">
        <strong>{component.name}</strong>
        <span>{KIND_LABELS[component.kind] ?? component.kind}</span>
        <code>{component.id}</code>
      </div>
      <label>
        <span>En servicio</span>
        <select
          disabled={disabled}
          value={value.inService === undefined ? "INHERIT" : value.inService ? "YES" : "NO"}
          onChange={(event) => onChange({
            inService: event.target.value === "INHERIT" ? undefined : event.target.value === "YES",
          })}
        >
          <option value="INHERIT">Heredar</option>
          <option value="YES">Sí</option>
          <option value="NO">No</option>
        </select>
      </label>
      {supportsPower && (
        <>
          <label>
            <span>P activa (kW)</span>
            <input
              disabled={disabled}
              type="number"
              step="1"
              value={numberOrEmpty(value.activePowerKw)}
              placeholder="Heredar"
              onChange={(event) => onChange({ activePowerKw: event.target.value === "" ? undefined : Number(event.target.value) })}
            />
          </label>
          <label>
            <span>Q reactiva (kVAr)</span>
            <input
              disabled={disabled}
              type="number"
              step="1"
              value={numberOrEmpty(value.reactivePowerKvar)}
              placeholder="Heredar"
              onChange={(event) => onChange({ reactivePowerKvar: event.target.value === "" ? undefined : Number(event.target.value) })}
            />
          </label>
        </>
      )}
      {supportsVoltage && (
        <label>
          <span>Tensión (p.u.)</span>
          <input
            disabled={disabled}
            type="number"
            min="0.5"
            max="1.5"
            step="0.001"
            value={numberOrEmpty(value.voltageSetpointPu)}
            placeholder="Heredar"
            onChange={(event) => onChange({ voltageSetpointPu: event.target.value === "" ? undefined : Number(event.target.value) })}
          />
        </label>
      )}
      {supportsTap && (
        <label>
          <span>Tap</span>
          <input
            disabled={disabled}
            type="number"
            step="1"
            value={numberOrEmpty(value.tapPosition)}
            placeholder="Heredar"
            onChange={(event) => onChange({ tapPosition: event.target.value === "" ? undefined : Number(event.target.value) })}
          />
        </label>
      )}
      {supportsSwitch && (
        <label>
          <span>Interruptor</span>
          <select
            disabled={disabled}
            value={value.switchClosed === undefined ? "INHERIT" : value.switchClosed ? "CLOSED" : "OPEN"}
            onChange={(event) => onChange({
              switchClosed: event.target.value === "INHERIT" ? undefined : event.target.value === "CLOSED",
            })}
          >
            <option value="INHERIT">Heredar</option>
            <option value="CLOSED">Cerrado</option>
            <option value="OPEN">Abierto</option>
          </select>
        </label>
      )}
      <button className="mini-button" type="button" disabled={disabled || !Object.keys(value).length} onClick={onClear} title="Limpiar overrides">×</button>
    </div>
  );
}

function CasesTab({ document, validation, actions, canEdit }) {
  const cases = normalizeOperatingCases(document.operatingCases);
  const [selectedCaseId, setSelectedCaseId] = useState(() => cases.find((item) => item.isDefault)?.id ?? cases[0]?.id);
  const selectedCase = getOperatingCase(document, selectedCaseId);
  const configurableComponents = validation.model.components;

  const addCase = () => {
    const id = actions.addOperatingCase();
    if (id) setSelectedCaseId(id);
  };

  return (
    <div className="analysis-tab-content">
      <div className="analysis-toolbar-row">
        <select value={selectedCase.id} onChange={(event) => setSelectedCaseId(event.target.value)}>
          {cases.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isDefault ? " · predeterminado" : ""}</option>)}
        </select>
        <button className="button button--soft" type="button" disabled={!canEdit} onClick={addCase}>＋ Caso</button>
      </div>

      <section className="analysis-section-card">
        <label className="property-field">
          <span>Nombre del caso</span>
          <input disabled={!canEdit} value={selectedCase.name} onChange={(event) => actions.updateOperatingCase(selectedCase.id, { name: event.target.value })} />
        </label>
        <label className="property-field">
          <span>Descripción</span>
          <textarea disabled={!canEdit} rows="2" value={selectedCase.description} onChange={(event) => actions.updateOperatingCase(selectedCase.id, { description: event.target.value })} />
        </label>
        <div className="analysis-toolbar-row analysis-toolbar-row--spread">
          <label className="switch-row">
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={selectedCase.isDefault}
              onChange={() => actions.setDefaultOperatingCase(selectedCase.id)}
            />
            <span>Caso predeterminado</span>
          </label>
          <button
            className="button danger-outline"
            type="button"
            disabled={!canEdit || cases.length <= 1}
            onClick={() => {
              if (actions.removeOperatingCase(selectedCase.id)) {
                setSelectedCaseId(cases.find((item) => item.id !== selectedCase.id)?.id);
              }
            }}
          >
            Eliminar caso
          </button>
        </div>
      </section>

      <section className="analysis-section-card analysis-section-card--wide">
        <h3>Overrides por componente</h3>
        <p>Los campos vacíos heredan el valor base de la ficha eléctrica. El diagrama no se duplica.</p>
        <div className="case-overrides-list">
          {configurableComponents.map((component) => (
            <CaseOverrideFields
              key={component.id}
              component={component}
              value={selectedCase.overrides?.[component.id] ?? {}}
              disabled={!canEdit}
              onChange={(patch) => actions.updateOperatingCaseOverride(selectedCase.id, component.id, patch)}
              onClear={() => actions.clearOperatingCaseOverride(selectedCase.id, component.id)}
            />
          ))}
          {!configurableComponents.length && <p>No hay equipos configurables en este diagrama.</p>}
        </div>
      </section>
    </div>
  );
}

function ConfigurationTab({ configuration, actions, canEdit }) {
  const solver = configuration.solverOptions;
  const validation = configuration.validationOptions;
  return (
    <div className="analysis-tab-content">
      <section className="analysis-section-card">
        <h3>Configuración por defecto</h3>
        <label className="property-field">
          <span>Preferencia de ejecución</span>
          <select
            disabled={!canEdit}
            value={configuration.defaultExecutionPreference}
            onChange={(event) => actions.updateAnalysisConfiguration(null, { defaultExecutionPreference: event.target.value })}
          >
            <option value="AUTO">Automática · recomendada</option>
            <option value="STANDARD">Estándar</option>
            <option value="ADVANCED">Avanzada · futura</option>
          </select>
        </label>
      </section>

      <section className="analysis-section-card">
        <h3>Solver de flujo de carga</h3>
        <label className="property-field">
          <span>Algoritmo</span>
          <select disabled={!canEdit} value={solver.algorithm} onChange={(event) => actions.updateAnalysisConfiguration("solverOptions", { algorithm: event.target.value })}>
            <option value="NEWTON_RAPHSON">Newton-Raphson</option>
            <option value="FAST_DECOUPLED">Desacoplado rápido</option>
            <option value="GAUSS_SEIDEL">Gauss-Seidel</option>
          </select>
        </label>
        <label className="property-field">
          <span>Tolerancia</span>
          <input disabled={!canEdit} type="number" min="0.000000001" step="0.000001" value={solver.tolerance} onChange={(event) => actions.updateAnalysisConfiguration("solverOptions", { tolerance: Number(event.target.value) })} />
        </label>
        <label className="property-field">
          <span>Iteraciones máximas</span>
          <input disabled={!canEdit} type="number" min="1" step="1" value={solver.maximumIterations} onChange={(event) => actions.updateAnalysisConfiguration("solverOptions", { maximumIterations: Number(event.target.value) })} />
        </label>
        <label className="switch-row">
          <input disabled={!canEdit} type="checkbox" checked={solver.calculateVoltageAngles} onChange={(event) => actions.updateAnalysisConfiguration("solverOptions", { calculateVoltageAngles: event.target.checked })} />
          <span>Calcular ángulos de tensión</span>
        </label>
        <label className="switch-row">
          <input disabled={!canEdit} type="checkbox" checked={solver.enforceReactiveLimits} onChange={(event) => actions.updateAnalysisConfiguration("solverOptions", { enforceReactiveLimits: event.target.checked })} />
          <span>Aplicar límites reactivos</span>
        </label>
      </section>

      <section className="analysis-section-card">
        <h3>Reglas de validación</h3>
        <label className="switch-row">
          <input disabled={!canEdit} type="checkbox" checked={validation.allowAssumedParameters} onChange={(event) => actions.updateAnalysisConfiguration("validationOptions", { allowAssumedParameters: event.target.checked })} />
          <span>Permitir valores asumidos</span>
        </label>
        <label className="switch-row">
          <input disabled={!canEdit} type="checkbox" checked={validation.requireThermalLimits} onChange={(event) => actions.updateAnalysisConfiguration("validationOptions", { requireThermalLimits: event.target.checked })} />
          <span>Exigir límites térmicos</span>
        </label>
      </section>
    </div>
  );
}

function ModelTab({ document, validation, activeDiagram }) {
  const defaultCase = normalizeOperatingCases(document.operatingCases).find((item) => item.isDefault);
  const downloadInput = () => {
    const preview = createAnalysisInputPreview(document, {
      diagramId: activeDiagram?.id ?? document.id,
      diagramStorageVersion: activeDiagram?.storageVersion ?? "<storageVersion>",
      operatingCaseId: defaultCase?.id,
    });
    downloadTextFile(`${safeFilename(document.name)}-analysis-input-preview.json`, JSON.stringify(preview, null, 2));
  };
  const downloadRequest = () => {
    const preview = createAnalysisRequestPreview(document, {
        diagramId: activeDiagram?.id ?? document.id,
      operatingCaseId: defaultCase?.id,
      expectedDiagramVersion: activeDiagram?.storageVersion ?? "<storageVersion>",
    });
    downloadTextFile(`${safeFilename(document.name)}-analysis-request-preview.json`, JSON.stringify(preview, null, 2));
  };

  return (
    <div className="analysis-tab-content">
      <div className="analysis-toolbar-row">
        <button className="button button--primary" type="button" onClick={downloadInput}>Descargar input.json de prueba</button>
        <button className="button button--soft" type="button" onClick={downloadRequest}>Descargar solicitud</button>
      </div>
      <section className="analysis-section-card">
        <h3>Componentes lógicos</h3>
        <div className="analysis-model-list">
          {validation.model.components.map((component) => (
            <div key={component.id}>
              <span>{KIND_LABELS[component.kind] ?? component.kind}</span>
              <strong>{component.name}</strong>
              <code>{component.terminalIds.length} terminal(es)</code>
            </div>
          ))}
        </div>
      </section>
      <section className="analysis-section-card">
        <h3>Nodos de conexión</h3>
        <div className="analysis-model-list">
          {validation.model.connectionNodes.map((node) => (
            <div key={node.id}>
              <span>{node.nominalVoltageKv ?? "—"} kV</span>
              <strong>{node.busComponentId ?? "Unión sin barra explícita"}</strong>
              <code>{node.id}</code>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function AnalysisPanel() {
  const document = useEditorSelector((state) => state.document);
  const actions = useEditorActions();
  const { activeProject, activeDiagram } = useWorkspace();
  const [tab, setTab] = useState("overview");
  const validation = useMemo(() => evaluateAnalysisReadiness(document), [document]);
  const configuration = normalizeAnalysisConfiguration(document.analysisConfiguration);

  return (
    <aside className="properties-panel analysis-panel">
      <div className="panel-header analysis-panel-header">
        <div><span className="eyebrow">Preparación de datos</span><h2>Análisis eléctricos</h2></div>
        <button className="mini-button" type="button" onClick={actions.closeAnalysisPanel} title="Volver a propiedades">×</button>
      </div>
      <div className="analysis-tabs" role="tablist">
        {[
          ["overview", "Preparación"],
          ["cases", "Casos"],
          ["configuration", "Solver"],
          ["model", "Modelo"],
        ].map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === "overview" && <OverviewTab document={document} validation={validation} activeDiagram={activeDiagram} />}
      {tab === "cases" && <CasesTab document={document} validation={validation} actions={actions} canEdit={Boolean(activeProject?.canEdit)} />}
      {tab === "configuration" && <ConfigurationTab configuration={configuration} actions={actions} canEdit={Boolean(activeProject?.canEdit)} />}
      {tab === "model" && <ModelTab document={document} validation={validation} activeDiagram={activeDiagram} />}
    </aside>
  );
}
