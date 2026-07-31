import { useCallback, useEffect, useMemo, useState } from "react";
import { createAnalysisInputPreview, createAnalysisRequestPreview } from "../../domain/analysis/createAnalysisInput.js";
import { evaluateAnalysisReadiness, evaluateAnalysisReadinessForType } from "../../domain/analysis/analysisReadiness.js";
import { normalizeAnalysisConfiguration } from "../../domain/analysis/analysisConfiguration.js";
import {
  ANALYSIS_TYPES,
  analysisTypeLabel,
  analysisUnits,
  createDefaultAnalysisOptions,
  getAnalysisDefinition,
  normalizeAnalysisOptions,
} from "../../domain/analysis/analysisRegistry.js";
import { getOperatingCase, normalizeOperatingCases } from "../../domain/analysis/operatingCases.js";
import { buildProjectAnalysisDocument, localIdFromGlobal } from "../../domain/electrical/projectTopology.js";
import {
  formatCurrentA,
  formatPowerKw,
  formatReactivePowerKvar,
  formatResultNumber,
  analysisResultViews,
  getAnalysisNetworkResult,
  getAnalysisResultView,
  normalizeAnalysisOverlayOptions,
  parseAnalysisResultText,
} from "../../domain/analysis/analysisResults.js";
import { shallowEqual, useEditorActions, useEditorSelector } from "../../editor/EditorContext.jsx";
import { useWorkspace } from "../../workspace/WorkspaceContext.jsx";
import { downloadTextFile, safeFilename } from "../../utils/download.js";
import {
  createAnalysisClientRequestId,
  getAnalysisStudyService,
  listAnalysisStudiesByDiagramService,
  listAnalysisStudiesByProjectService,
  loadAnalysisArtifactTextService,
  startAnalysisService,
} from "../../services/analysis/index.js";

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
          <span>Análisis por defecto</span><strong>{analysisTypeLabel(configuration.defaultAnalysisType)}</strong>
          <span>Caso por defecto</span><strong>{defaultCase.name}</strong>
          <span>Ejecución</span><strong>{configuration.defaultExecutionPreference}</strong>
          <span>Versión S3</span><strong>{activeDiagram?.storageVersion ?? "Sin sincronizar"}</strong>
          <span>Unidades</span><strong>{analysisUnits(configuration.defaultAnalysisType)} unidad(es)</strong>
        </div>
        <p className="analysis-phase-note">
          El modelo puede guardarse y enviarse al solver desde la pestaña Ejecutar. Un resultado convergente puede activarse como capa visual, revisarse en tablas y consultarse dentro de cada componente.
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
          <span>Análisis por defecto</span>
          <select
            disabled={!canEdit}
            value={configuration.defaultAnalysisType}
            onChange={(event) => actions.updateAnalysisConfiguration(null, { defaultAnalysisType: event.target.value })}
          >
            {ANALYSIS_TYPES.map((id) => <option key={id} value={id}>{analysisTypeLabel(id)}</option>)}
          </select>
        </label>
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
        <h3>Solver AC compartido</h3>
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


const TERMINAL_ANALYSIS_STATUSES = new Set([
  "CONVERGED",
  "NOT_CONVERGED",
  "FAILED",
  "TIMED_OUT",
  "CANCELLED",
]);

const ANALYSIS_STATUS_LABELS = {
  VALIDATING: "Validando",
  QUEUED: "En cola",
  STARTING: "Iniciando",
  RUNNING: "Ejecutando",
  CONVERGED: "Convergió",
  NOT_CONVERGED: "No convergió",
  FAILED: "Falló",
  TIMED_OUT: "Tiempo agotado",
  CANCELLED: "Cancelado",
};

function formatStudyDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("es-CL");
}

function statusTone(status) {
  if (status === "CONVERGED") return "success";
  if (status === "NOT_CONVERGED") return "warning";
  if (["FAILED", "TIMED_OUT", "CANCELLED"].includes(status)) return "error";
  return "progress";
}

function ToggleField({ checked, label, onChange }) {
  return (
    <label className="analysis-toggle-field">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function SelectionList({ title, items, selectedIds, onChange, emptyMessage }) {
  const selected = new Set(selectedIds ?? []);
  return (
    <section className="analysis-option-group">
      <div className="analysis-option-group__heading">
        <strong>{title}</strong>
        <button className="mini-button" type="button" onClick={() => onChange([])}>Todos</button>
      </div>
      {!items.length && <p className="analysis-phase-note">{emptyMessage}</p>}
      <div className="analysis-selection-list">
        {items.map((item) => (
          <label key={item.id}>
            <input
              type="checkbox"
              checked={selected.has(item.id)}
              onChange={(event) => {
                const next = new Set(selected);
                if (event.target.checked) next.add(item.id);
                else next.delete(item.id);
                onChange([...next]);
              }}
            />
            <span>{item.label}</span>
            <code>{item.id}</code>
          </label>
        ))}
      </div>
      <small>Sin selección explícita se incluyen todos los elementos compatibles.</small>
    </section>
  );
}

function AnalysisSpecificOptions({ analysisType, value, onChange, document, validation }) {
  const patch = (next) => onChange(normalizeAnalysisOptions(analysisType, { ...value, ...next }));
  const lineAndTransformers = validation.model.components
    .filter((item) => ["LINE", "TRANSFORMER_2W"].includes(item.kind) && item.inService)
    .map((item) => ({ id: item.id, label: `${item.name || item.id} · ${KIND_LABELS[item.kind] || item.kind}` }));
  const loads = validation.model.components
    .filter((item) => item.kind === "LOAD" && item.inService)
    .map((item) => ({ id: item.id, label: item.name || item.id }));
  const cases = normalizeOperatingCases(document.operatingCases)
    .map((item) => ({ id: item.id, label: item.name }));

  if (analysisType === "POWER_FLOW") {
    return <p className="analysis-phase-note">Utiliza la configuración AC definida en la pestaña Solver.</p>;
  }
  if (analysisType === "DC_POWER_FLOW") {
    return (
      <div className="analysis-option-fields">
        <ToggleField checked={value.calculateLineLoading !== false} label="Calcular cargabilidad aproximada de líneas" onChange={(checked) => patch({ calculateLineLoading: checked })} />
        <p className="analysis-phase-note">El flujo DC aproxima ángulos y potencia activa. No calcula tensión reactiva ni pérdidas AC completas.</p>
      </div>
    );
  }
  if (analysisType === "CONTINGENCY_N_1") {
    return (
      <div className="analysis-option-fields">
        <div className="analysis-inline-options">
          <ToggleField checked={value.includeLines !== false} label="Incluir líneas" onChange={(checked) => patch({ includeLines: checked })} />
          <ToggleField checked={value.includeTransformers !== false} label="Incluir transformadores" onChange={(checked) => patch({ includeTransformers: checked })} />
        </div>
        <SelectionList
          title="Elementos contingenciables"
          items={lineAndTransformers}
          selectedIds={value.selectedComponentIds}
          onChange={(selectedComponentIds) => patch({ selectedComponentIds })}
          emptyMessage="No existen líneas o transformadores en servicio."
        />
        <div className="analysis-number-grid">
          <label><span>Máximo de contingencias</span><input type="number" min="1" max="100" value={value.maximumContingencies} onChange={(event) => patch({ maximumContingencies: Number(event.target.value) })} /></label>
          <label><span>Tensión mínima (p.u.)</span><input type="number" min="0.1" max="1.5" step="0.001" value={value.minimumVoltagePu} onChange={(event) => patch({ minimumVoltagePu: Number(event.target.value) })} /></label>
          <label><span>Tensión máxima (p.u.)</span><input type="number" min="0.1" max="1.5" step="0.001" value={value.maximumVoltagePu} onChange={(event) => patch({ maximumVoltagePu: Number(event.target.value) })} /></label>
          <label><span>Carga máxima (%)</span><input type="number" min="1" max="1000" step="1" value={value.maximumLoadingPercent} onChange={(event) => patch({ maximumLoadingPercent: Number(event.target.value) })} /></label>
        </div>
      </div>
    );
  }
  if (analysisType === "OPERATING_CASE_SWEEP") {
    return (
      <div className="analysis-option-fields">
        <SelectionList
          title="Casos incluidos"
          items={cases}
          selectedIds={value.caseIds}
          onChange={(caseIds) => patch({ caseIds })}
          emptyMessage="El diagrama no contiene casos de operación."
        />
        <div className="analysis-number-grid">
          <label><span>Tensión mínima (p.u.)</span><input type="number" step="0.001" value={value.minimumVoltagePu} onChange={(event) => patch({ minimumVoltagePu: Number(event.target.value) })} /></label>
          <label><span>Tensión máxima (p.u.)</span><input type="number" step="0.001" value={value.maximumVoltagePu} onChange={(event) => patch({ maximumVoltagePu: Number(event.target.value) })} /></label>
          <label><span>Carga máxima (%)</span><input type="number" step="1" value={value.maximumLoadingPercent} onChange={(event) => patch({ maximumLoadingPercent: Number(event.target.value) })} /></label>
        </div>
      </div>
    );
  }
  if (analysisType === "LOADABILITY") {
    return (
      <div className="analysis-option-fields">
        <SelectionList
          title="Cargas escaladas"
          items={loads}
          selectedIds={value.selectedComponentIds}
          onChange={(selectedComponentIds) => patch({ selectedComponentIds })}
          emptyMessage="No existen cargas en servicio."
        />
        <div className="analysis-number-grid">
          <label><span>Multiplicador inicial</span><input type="number" min="0.01" step="0.01" value={value.startMultiplier} onChange={(event) => patch({ startMultiplier: Number(event.target.value) })} /></label>
          <label><span>Multiplicador máximo</span><input type="number" min="0.01" step="0.05" value={value.maximumMultiplier} onChange={(event) => patch({ maximumMultiplier: Number(event.target.value) })} /></label>
          <label><span>Incremento</span><input type="number" min="0.001" step="0.01" value={value.step} onChange={(event) => patch({ step: Number(event.target.value) })} /></label>
          <label><span>Tensión mínima (p.u.)</span><input type="number" step="0.001" value={value.minimumVoltagePu} onChange={(event) => patch({ minimumVoltagePu: Number(event.target.value) })} /></label>
          <label><span>Tensión máxima (p.u.)</span><input type="number" step="0.001" value={value.maximumVoltagePu} onChange={(event) => patch({ maximumVoltagePu: Number(event.target.value) })} /></label>
          <label><span>Carga máxima (%)</span><input type="number" step="1" value={value.maximumLoadingPercent} onChange={(event) => patch({ maximumLoadingPercent: Number(event.target.value) })} /></label>
        </div>
        <ToggleField checked={value.stopAtFirstViolation !== false} label="Detener en la primera violación" onChange={(checked) => patch({ stopAtFirstViolation: checked })} />
      </div>
    );
  }
  return null;
}

function ExecutionTab({
  document,
  sourceDocument,
  configuration,
  activeProject,
  activeDiagram,
  editorActions,
  workspaceActions,
}) {
  const cases = normalizeOperatingCases(document.operatingCases);
  const defaultCase = cases.find((item) => item.isDefault) ?? cases[0];
  const defaultPreference = configuration.defaultExecutionPreference === "ADVANCED" ? "AUTO" : configuration.defaultExecutionPreference;
  const initialType = ANALYSIS_TYPES.includes(configuration.defaultAnalysisType) ? configuration.defaultAnalysisType : "POWER_FLOW";
  const [analysisType, setAnalysisType] = useState(initialType);
  const [analysisOptions, setAnalysisOptions] = useState(() => createDefaultAnalysisOptions(initialType));
  const [selectedCaseId, setSelectedCaseId] = useState(defaultCase.id);
  const [executionPreference, setExecutionPreference] = useState(defaultPreference);
  const [studyName, setStudyName] = useState("");
  const [currentStudy, setCurrentStudy] = useState(null);
  const [history, setHistory] = useState([]);
  const [artifactType, setArtifactType] = useState("STUDY");
  const [artifactText, setArtifactText] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const validation = useMemo(
    () => evaluateAnalysisReadinessForType(document, analysisType, analysisOptions),
    [document, analysisType, analysisOptions],
  );
  const definition = getAnalysisDefinition(analysisType);

  useEffect(() => {
    if (!cases.some((item) => item.id === selectedCaseId)) setSelectedCaseId(defaultCase.id);
  }, [cases, defaultCase.id, selectedCaseId]);

  const changeType = (nextType) => {
    setAnalysisType(nextType);
    setAnalysisOptions(createDefaultAnalysisOptions(nextType));
    setStudyName("");
  };

  const refreshHistory = useCallback(async () => {
    if (!activeDiagram?.id || !activeProject?.id) return [];
    setHistoryLoading(true);
    try {
      const studies = activeProject.multiDiagram
        ? await listAnalysisStudiesByProjectService(activeProject.id)
        : await listAnalysisStudiesByDiagramService(activeDiagram.id);
      setHistory(studies);
      return studies;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      return [];
    } finally {
      setHistoryLoading(false);
    }
  }, [activeDiagram?.id, activeProject?.id, activeProject?.multiDiagram]);

  useEffect(() => {
    setCurrentStudy(null);
    setArtifactType("STUDY");
    setArtifactText("");
    setMessage("");
    setError("");
    refreshHistory();
  }, [activeDiagram?.id, refreshHistory]);

  const showStudy = useCallback((study) => {
    setCurrentStudy(study);
    setArtifactType("STUDY");
    setArtifactText(JSON.stringify(study, null, 2));
    setError("");
  }, []);

  const loadArtifact = useCallback(async (study, type, { activate = false } = {}) => {
    if (!study?.id) return null;
    setBusy(true);
    setError("");
    try {
      const loaded = await loadAnalysisArtifactTextService(study.id, type);
      setArtifactType(type);
      setArtifactText(loaded.text);
      if (type === "RESULT") {
        const parsed = parseAnalysisResultText(loaded.text);
        const belongsToActiveScope = parsed.diagramId === activeDiagram?.id
          || (Boolean(study.multiDiagram) && study.projectId === activeProject?.id);
        if (!belongsToActiveScope) throw new Error("El resultado pertenece a otro proyecto o diagrama.");
        if (activate) {
          editorActions.activateAnalysisResult(study, parsed);
          setMessage("Resultado activo sobre el diagrama.");
        } else setMessage("result.json descargado desde S3.");
        return parsed;
      }
      setMessage(`${type.toLowerCase()} descargado desde S3.`);
      return loaded.text;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      return null;
    } finally {
      setBusy(false);
    }
  }, [activeDiagram?.id, activeProject?.id, editorActions]);

  useEffect(() => {
    const studyId = currentStudy?.id;
    const status = currentStudy?.status;
    if (!studyId || TERMINAL_ANALYSIS_STATUSES.has(status)) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const updated = await getAnalysisStudyService(studyId);
        if (cancelled || !updated) return;
        setCurrentStudy(updated);
        setArtifactType("STUDY");
        setArtifactText(JSON.stringify(updated, null, 2));
        if (TERMINAL_ANALYSIS_STATUSES.has(updated.status)) {
          setMessage(`El estudio terminó con estado ${updated.status}.`);
          await refreshHistory();
          if (["CONVERGED", "NOT_CONVERGED"].includes(updated.status) && updated.resultStorageKey) {
            await loadArtifact(updated, "RESULT", { activate: true });
          } else if (updated.diagnosticsStorageKey) await loadArtifact(updated, "DIAGNOSTICS");
        }
      } catch (nextError) {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    };
    const timer = window.setInterval(poll, 2500);
    poll();
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [currentStudy?.id, currentStudy?.status, loadArtifact, refreshHistory]);

  const runAnalysis = async () => {
    if (!activeProject?.id || !activeDiagram?.id) return;
    setBusy(true);
    setError("");
    setMessage(activeProject.multiDiagram
      ? "Guardando las hojas pendientes del proyecto…"
      : "Guardando la versión actual del diagrama…");
    try {
      editorActions.setPersistence("saving", "Guardando antes del análisis");
      const expectedDiagramVersions = Object.fromEntries(
        activeProject.diagrams.map((sheet) => [sheet.id, Number(sheet.storageVersion ?? 0)]),
      );
      const sheetsToSave = activeProject.multiDiagram
        ? activeProject.diagrams.filter((sheet) => (
            sheet.id === activeDiagram.id || (sheet.recoveredDraft && sheet.document)
          ))
        : activeProject.diagrams.filter((sheet) => sheet.id === activeDiagram.id);
      let activeSaved = null;
      for (const sheet of sheetsToSave) {
        const saved = await workspaceActions.saveDiagramDocument(
          activeProject.id,
          sheet.id,
          sheet.id === activeDiagram.id ? sourceDocument : sheet.document,
        );
        expectedDiagramVersions[sheet.id] = Number(saved.storageVersion);
        if (sheet.id === activeDiagram.id) activeSaved = saved;
      }
      if (!activeSaved) throw new Error("No fue posible guardar la hoja activa antes del análisis.");
      editorActions.setPersistence("saved", "Guardado en la nube");
      setMessage("Creando el estudio y enviándolo al solver…");
      const normalizedOptions = normalizeAnalysisOptions(analysisType, analysisOptions);
      const request = await startAnalysisService({
        diagramId: activeDiagram.id,
        operatingCaseId: selectedCaseId,
        analysisType,
        analysisOptionsJson: JSON.stringify(normalizedOptions),
        executionPreference,
        expectedDiagramVersion: Number(activeSaved.storageVersion),
        expectedDiagramVersionsJson: activeProject.multiDiagram
          ? JSON.stringify(expectedDiagramVersions)
          : undefined,
        clientRequestId: createAnalysisClientRequestId(),
        name: studyName.trim() || undefined,
      });
      const study = await getAnalysisStudyService(request.studyId);
      if (study) showStudy(study);
      setMessage(request.message || "Estudio enviado al solver.");
      await refreshHistory();
    } catch (nextError) {
      editorActions.setPersistence("error", "No se pudo iniciar el análisis");
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const selectedCase = getOperatingCase(document, selectedCaseId);
  const canRun = Boolean(activeProject?.canEdit && activeDiagram?.id && validation.readiness !== "NOT_READY" && !busy);
  const status = currentStudy?.status;

  return (
    <div className="analysis-tab-content">
      <section className="analysis-section-card analysis-run-card">
        <h3>Nuevo estudio</h3>
        <label className="property-field">
          <span>Tipo de análisis</span>
          <select value={analysisType} onChange={(event) => changeType(event.target.value)}>
            {ANALYSIS_TYPES.map((id) => <option key={id} value={id}>{analysisTypeLabel(id)}</option>)}
          </select>
        </label>
        <p className="analysis-phase-note">{definition.description}</p>
        <label className="property-field">
          <span>Nombre del estudio</span>
          <input value={studyName} onChange={(event) => setStudyName(event.target.value)} placeholder={`${definition.shortLabel} · ${document.name}`} />
        </label>
        <label className="property-field">
          <span>Caso base</span>
          <select value={selectedCase.id} onChange={(event) => setSelectedCaseId(event.target.value)}>
            {cases.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="property-field">
          <span>Modo de ejecución</span>
          <select value={executionPreference} onChange={(event) => setExecutionPreference(event.target.value)}>
            <option value="AUTO">Automática</option>
            <option value="STANDARD">Estándar · Lambda</option>
          </select>
        </label>
        <AnalysisSpecificOptions analysisType={analysisType} value={analysisOptions} onChange={setAnalysisOptions} document={document} validation={validation} />
        <AnalysisSummary validation={validation} />
        <div className="read-only-grid analysis-run-summary">
          <span>Análisis</span><strong>{analysisType}</strong>
          <span>Versión actual</span><strong>{activeDiagram?.storageVersion ?? 0}</strong>
          <span>Alcance</span><strong>{activeProject?.multiDiagram ? `${activeProject.diagrams.length} diagramas` : "Hoja activa"}</strong>
          <span>Unidades reservadas</span><strong>{analysisUnits(analysisType)}</strong>
          <span>Proveedor</span><strong>Lambda Docker</strong>
        </div>
        <button className="button button--primary analysis-run-button" type="button" disabled={!canRun} onClick={runAnalysis}>
          {busy ? "Procesando…" : "Guardar y ejecutar análisis"}
        </button>
        {!activeProject?.canEdit && <p className="analysis-phase-note">Se necesita permiso de edición para ejecutar estudios.</p>}
        {validation.readiness === "NOT_READY" && <p className="analysis-phase-note analysis-phase-note--error">Corrige los errores bloqueantes antes de ejecutar.</p>}
      </section>

      {(message || error) && <section className={`analysis-operation-message ${error ? "analysis-operation-message--error" : ""}`}>{error || message}</section>}

      {currentStudy && (
        <section className="analysis-section-card">
          <div className="analysis-study-heading">
            <div><h3>Estudio actual</h3><code>{currentStudy.id}</code></div>
            <span className={`analysis-status analysis-status--${statusTone(currentStudy.status)}`}>{ANALYSIS_STATUS_LABELS[currentStudy.status] ?? currentStudy.status}</span>
          </div>
          <div className="read-only-grid">
            <span>Tipo</span><strong>{analysisTypeLabel(currentStudy.analysisType)}</strong>
            <span>Solicitado</span><strong>{formatStudyDate(currentStudy.requestedAt)}</strong>
            <span>Inicio</span><strong>{formatStudyDate(currentStudy.startedAt)}</strong>
            <span>Término</span><strong>{formatStudyDate(currentStudy.completedAt)}</strong>
            <span>Motor</span><strong>{currentStudy.engineName || "—"} {currentStudy.engineVersion || ""}</strong>
            <span>Unidades</span><strong>{currentStudy.consumedUnits ?? currentStudy.reservedUnits ?? 0}</strong>
          </div>
          {currentStudy.failureMessage && <p className="analysis-phase-note analysis-phase-note--error">{currentStudy.failureCode}: {currentStudy.failureMessage}</p>}
          <div className="analysis-artifact-actions">
            <button className="button button--soft" type="button" onClick={() => showStudy(currentStudy)}>Registro</button>
            <button className="button button--soft" type="button" disabled={busy || !currentStudy.inputStorageKey} onClick={() => loadArtifact(currentStudy, "INPUT")}>input.json</button>
            <button className="button button--soft" type="button" disabled={busy || !currentStudy.resultStorageKey} onClick={() => loadArtifact(currentStudy, "RESULT", { activate: true })}>Mostrar resultado</button>
            <button className="button button--soft" type="button" disabled={busy || !currentStudy.diagnosticsStorageKey} onClick={() => loadArtifact(currentStudy, "DIAGNOSTICS")}>Diagnóstico</button>
          </div>
        </section>
      )}

      <section className="analysis-section-card">
        <div className="analysis-study-heading">
          <h3>Estudios recientes</h3>
          <button className="mini-button" type="button" disabled={historyLoading} onClick={refreshHistory} title="Actualizar estudios">↻</button>
        </div>
        <div className="analysis-study-list">
          {history.map((study) => (
            <div key={study.id} className={currentStudy?.id === study.id ? "active" : ""}>
              <button className="analysis-study-main" type="button" onClick={() => showStudy(study)}>
                <span className={`analysis-status analysis-status--${statusTone(study.status)}`}>{ANALYSIS_STATUS_LABELS[study.status] ?? study.status}</span>
                <strong>{study.name || analysisTypeLabel(study.analysisType)}</strong>
                <small>{analysisTypeLabel(study.analysisType)} · {formatStudyDate(study.requestedAt)}</small>
              </button>
              {study.resultStorageKey && (
                <button className="analysis-study-activate" type="button" onClick={() => loadArtifact(study, "RESULT", { activate: true })}>
                  Mostrar
                </button>
              )}
            </div>
          ))}
          {!historyLoading && !history.length && <p className="analysis-phase-note">Todavía no existen estudios para este diagrama.</p>}
        </div>
      </section>

      {artifactText && (
        <section className="analysis-section-card analysis-section-card--wide">
          <div className="analysis-study-heading"><h3>{artifactType}</h3><button className="mini-button" type="button" onClick={() => downloadTextFile(`${safeFilename(currentStudy?.name || "analysis")}-${artifactType.toLowerCase()}.json`, artifactText)}>↓</button></div>
          <pre className="analysis-code-preview analysis-code-preview--result">{artifactText}</pre>
        </section>
      )}
    </div>
  );
}

function OverlayOption({ checked, label, onChange }) {
  return <ToggleField checked={checked} label={label} onChange={onChange} />;
}

function LabelOptionGroup({ title, description, children }) {
  return (
    <section className="analysis-section-card analysis-label-option-group">
      <div className="analysis-label-option-heading">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      <div className="analysis-overlay-controls">{children}</div>
    </section>
  );
}

function LabelsTab({ overlay, actions }) {
  if (!overlay?.result) {
    return (
      <div className="analysis-tab-content">
        <section className="analysis-empty-result">
          <strong>No hay un estudio activo</strong>
          <span>Selecciona un resultado convergente para configurar sus etiquetas.</span>
        </section>
      </div>
    );
  }

  const options = normalizeAnalysisOverlayOptions(overlay.options);
  const update = (key) => (value) => actions.updateAnalysisOverlayOptions({ [key]: value });

  return (
    <div className="analysis-tab-content">
      <section className="analysis-section-card analysis-label-settings-intro">
        <div>
          <h3>Etiquetas del estudio activo</h3>
          <p>Marca sólo los valores que necesitas ver. No existe expansión por hover: la caja muestra siempre la selección actual y puede moverse libremente.</p>
        </div>
        <div className="analysis-label-settings-actions">
          <button className="button button--soft" type="button" onClick={actions.resetAnalysisResultLabelLayout}>Restablecer posiciones</button>
          <button className="button button--soft" type="button" onClick={actions.resetAnalysisOverlayOptions}>Valores predeterminados</button>
        </div>
      </section>

      <LabelOptionGroup title="Capa general" description="Visibilidad, colores y ayudas de lectura.">
        <OverlayOption checked={options.visible} label="Mostrar resultados" onChange={update("visible")} />
        <OverlayOption checked={options.showComponentNames} label="Nombre del componente" onChange={update("showComponentNames")} />
        <OverlayOption checked={options.colorBusesByVoltage} label="Colorear barras por tensión" onChange={update("colorBusesByVoltage")} />
        <OverlayOption checked={options.colorBranchesByLoading} label="Colorear líneas por carga" onChange={update("colorBranchesByLoading")} />
        <OverlayOption checked={options.showFlowArrows} label="Flechas de flujo" onChange={update("showFlowArrows")} />
      </LabelOptionGroup>

      <LabelOptionGroup title="Barras" description="Magnitud, ángulo y estado eléctrico de cada barra.">
        <OverlayOption checked={options.showBusVoltagePu} label="Tensión en p.u." onChange={update("showBusVoltagePu")} />
        <OverlayOption checked={options.showBusVoltageKv} label="Tensión en kV" onChange={update("showBusVoltageKv")} />
        <OverlayOption checked={options.showBusAngleDeg} label="Ángulo" onChange={update("showBusAngleDeg")} />
        <OverlayOption checked={options.showBusStatus} label="Estado de tensión" onChange={update("showBusStatus")} />
      </LabelOptionGroup>

      <LabelOptionGroup title="Líneas" description="Valores tomados en el extremo de origen del resultado.">
        <OverlayOption checked={options.showBranchActivePower} label="Potencia activa" onChange={update("showBranchActivePower")} />
        <OverlayOption checked={options.showBranchReactivePower} label="Potencia reactiva" onChange={update("showBranchReactivePower")} />
        <OverlayOption checked={options.showBranchCurrent} label="Corriente" onChange={update("showBranchCurrent")} />
        <OverlayOption checked={options.showBranchLoading} label="Cargabilidad" onChange={update("showBranchLoading")} />
        <OverlayOption checked={options.showBranchLosses} label="Pérdidas activas" onChange={update("showBranchLosses")} />
        <OverlayOption checked={options.showBranchDirection} label="Dirección del flujo" onChange={update("showBranchDirection")} />
      </LabelOptionGroup>

      <LabelOptionGroup title="Transformadores" description="Potencias, carga, pérdidas y posición de tap.">
        <OverlayOption checked={options.showTransformerActivePower} label="Potencia activa" onChange={update("showTransformerActivePower")} />
        <OverlayOption checked={options.showTransformerReactivePower} label="Potencia reactiva" onChange={update("showTransformerReactivePower")} />
        <OverlayOption checked={options.showTransformerLoading} label="Cargabilidad" onChange={update("showTransformerLoading")} />
        <OverlayOption checked={options.showTransformerLosses} label="Pérdidas activas" onChange={update("showTransformerLosses")} />
        <OverlayOption checked={options.showTransformerTap} label="Posición de tap" onChange={update("showTransformerTap")} />
      </LabelOptionGroup>

      <LabelOptionGroup title="Generadores y cargas" description="Selecciona P y Q de forma independiente para cada familia.">
        <OverlayOption checked={options.showGeneratorActivePower} label="Generador · P" onChange={update("showGeneratorActivePower")} />
        <OverlayOption checked={options.showGeneratorReactivePower} label="Generador · Q" onChange={update("showGeneratorReactivePower")} />
        <OverlayOption checked={options.showLoadActivePower} label="Carga · P" onChange={update("showLoadActivePower")} />
        <OverlayOption checked={options.showLoadReactivePower} label="Carga · Q" onChange={update("showLoadReactivePower")} />
      </LabelOptionGroup>
    </div>
  );
}

function ResultTable({ columns, rows, emptyMessage }) {
  if (!rows.length) return <p className="analysis-phase-note">{emptyMessage}</p>;
  return (
    <div className="analysis-results-table-wrap">
      <table className="analysis-results-table">
        <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => (
          <tr key={row.componentId || row.busId || row.operatingCaseId || row.multiplier || index}>
            {columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : row[column.key] ?? "—"}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

const RESULT_CATEGORIES = [
  ["buses", "Barras"],
  ["branches", "Líneas"],
  ["transformers", "Transformadores"],
  ["generators", "Generadores"],
  ["loads", "Cargas"],
  ["warnings", "Advertencias"],
];

function AnalysisScenarioTable({ result, actions }) {
  if (result.analysisType === "CONTINGENCY_N_1") {
    return <ResultTable columns={[
      { key: "componentId", label: "Elemento" },
      { key: "status", label: "Estado" },
      { key: "violationCount", label: "Violaciones" },
      { key: "minimumVoltagePu", label: "V mínima", render: (row) => formatResultNumber(row.summary?.minimumVoltagePu, 4) },
      { key: "maximumLoadingPercent", label: "Carga máxima", render: (row) => `${formatResultNumber(row.summary?.maximumLoadingPercent, 2)} %` },
      { key: "show", label: "Vista", render: (row) => row.networkResult ? <button type="button" className="mini-button" onClick={() => actions.setAnalysisResultView(`contingency:${row.componentId}`)}>Mostrar</button> : "—" },
    ]} rows={result.contingencies} emptyMessage="No existen contingencias." />;
  }
  if (result.analysisType === "OPERATING_CASE_SWEEP") {
    return <ResultTable columns={[
      { key: "name", label: "Caso" },
      { key: "status", label: "Estado" },
      { key: "violationCount", label: "Violaciones" },
      { key: "minimumVoltagePu", label: "V mínima", render: (row) => formatResultNumber(row.summary?.minimumVoltagePu, 4) },
      { key: "maximumLoadingPercent", label: "Carga máxima", render: (row) => `${formatResultNumber(row.summary?.maximumLoadingPercent, 2)} %` },
      { key: "show", label: "Vista", render: (row) => row.networkResult ? <button type="button" className="mini-button" onClick={() => actions.setAnalysisResultView(`case:${row.operatingCaseId}`)}>Mostrar</button> : "—" },
    ]} rows={result.cases} emptyMessage="No existen casos ejecutados." />;
  }
  if (result.analysisType === "LOADABILITY") {
    return <ResultTable columns={[
      { key: "multiplier", label: "Multiplicador", render: (row) => `×${formatResultNumber(row.multiplier, 3)}` },
      { key: "status", label: "Estado" },
      { key: "violationCount", label: "Violaciones" },
      { key: "minimumVoltagePu", label: "V mínima", render: (row) => formatResultNumber(row.summary?.minimumVoltagePu, 4) },
      { key: "maximumLoadingPercent", label: "Carga máxima", render: (row) => `${formatResultNumber(row.summary?.maximumLoadingPercent, 2)} %` },
    ]} rows={result.steps} emptyMessage="No existen pasos de cargabilidad." />;
  }
  return null;
}

function ResultsTab({ overlay, actions, activeDiagram, document }) {
  const [category, setCategory] = useState("buses");
  const rawResult = overlay?.result;
  if (!rawResult) {
    return <div className="analysis-tab-content"><section className="analysis-empty-result"><strong>No hay resultados activos</strong><span>Ejecuta o selecciona un estudio convergente.</span></section></div>;
  }
  const result = rawResult;
  const views = analysisResultViews(result);
  const view = getAnalysisResultView(result, overlay.viewId);
  const network = getAnalysisNetworkResult(result, overlay.viewId);
  const options = overlay.options ?? {};
  const summary = network.summary ?? result.summary ?? {};
  const currentVersion = Number(activeDiagram?.storageVersion ?? 0);
  let projectVersions = result.diagramVersions && typeof result.diagramVersions === "object"
    ? result.diagramVersions
    : {};
  if (!Object.keys(projectVersions).length && overlay.study?.inputProjectVersionsJson) {
    try {
      projectVersions = JSON.parse(overlay.study.inputProjectVersionsJson);
    } catch {
      projectVersions = {};
    }
  }
  const resultVersion = Number(
    projectVersions[activeDiagram?.id]
      ?? result.diagramStorageVersion
      ?? overlay.study?.inputDiagramVersion
      ?? 0,
  );
  const versionMismatch = Boolean(currentVersion && resultVersion && currentVersion !== resultVersion);
  const componentLabel = (id) => {
    const localId = localIdFromGlobal(id, document.id);
    return document.nodes?.[localId]?.properties?.name
      || document.edges?.[localId]?.properties?.name
      || id;
  };
  const rows = network[category] ?? [];
  const columnsByCategory = {
    buses: [
      { key: "busId", label: "Barra", render: (row) => componentLabel(row.busId) },
      { key: "voltagePu", label: "V p.u.", render: (row) => formatResultNumber(row.voltagePu, 5) },
      { key: "voltageKv", label: "kV", render: (row) => formatResultNumber(row.voltageKv, 3) },
      { key: "angleDeg", label: "Ángulo", render: (row) => `${formatResultNumber(row.angleDeg, 4)}°` },
      { key: "status", label: "Estado" },
    ],
    branches: [
      { key: "componentId", label: "Línea", render: (row) => componentLabel(row.componentId) },
      { key: "activePowerFromKw", label: "P origen", render: (row) => formatPowerKw(row.activePowerFromKw) },
      { key: "currentFromA", label: "I", render: (row) => formatCurrentA(row.currentFromA) },
      { key: "loadingPercent", label: "Carga", render: (row) => `${formatResultNumber(row.loadingPercent, 2)} %` },
      { key: "activeLossKw", label: "Pérdidas", render: (row) => formatPowerKw(row.activeLossKw) },
      { key: "direction", label: "Dirección" },
    ],
    transformers: [
      { key: "componentId", label: "Transformador", render: (row) => componentLabel(row.componentId) },
      { key: "activePowerPrimaryKw", label: "P primario", render: (row) => formatPowerKw(row.activePowerPrimaryKw) },
      { key: "loadingPercent", label: "Carga", render: (row) => `${formatResultNumber(row.loadingPercent, 2)} %` },
      { key: "tapPosition", label: "Tap" },
      { key: "activeLossKw", label: "Pérdidas", render: (row) => formatPowerKw(row.activeLossKw) },
    ],
    generators: [
      { key: "componentId", label: "Generador", render: (row) => componentLabel(row.componentId) },
      { key: "controlMode", label: "Control" },
      { key: "activePowerKw", label: "P", render: (row) => formatPowerKw(row.activePowerKw) },
      { key: "reactivePowerKvar", label: "Q", render: (row) => formatReactivePowerKvar(row.reactivePowerKvar) },
    ],
    loads: [
      { key: "componentId", label: "Carga", render: (row) => componentLabel(row.componentId) },
      { key: "activePowerKw", label: "P", render: (row) => formatPowerKw(row.activePowerKw) },
      { key: "reactivePowerKvar", label: "Q", render: (row) => formatReactivePowerKvar(row.reactivePowerKvar) },
      { key: "busId", label: "Barra" },
    ],
    warnings: [
      { key: "code", label: "Código" },
      { key: "message", label: "Mensaje" },
      { key: "componentId", label: "Componente" },
    ],
  };

  return (
    <div className="analysis-tab-content">
      <section className="analysis-section-card analysis-active-result-card">
        <div className="analysis-study-heading">
          <div><span className="eyebrow">Resultado activo</span><h3>{overlay.study?.name || analysisTypeLabel(result.analysisType)}</h3><code>{result.studyId}</code></div>
          <button className="mini-button danger-outline" type="button" onClick={actions.clearActiveAnalysisResult} title="Quitar resultados">×</button>
        </div>
        <div className="read-only-grid">
          <span>Tipo</span><strong>{analysisTypeLabel(result.analysisType)}</strong>
          <span>Vista activa</span><strong>{view?.label || "—"}</strong>
          <span>Versión</span><strong>{resultVersion || "—"}</strong>
          <span>Motor</span><strong>{result.engine?.name || overlay.study?.engineName || "—"} {result.engine?.version || ""}</strong>
          <span>Convergencia</span><strong>{result.convergence?.converged ? "Convergió" : "No convergió"}</strong>
          <span>Duración</span><strong>{result.convergence?.durationMs != null ? `${formatResultNumber(result.convergence.durationMs, 0)} ms` : "—"}</strong>
        </div>
      </section>

      {views.length > 1 && (
        <section className="analysis-section-card">
          <label className="property-field"><span>Escenario mostrado en el diagrama</span><select value={view?.id || ""} onChange={(event) => actions.setAnalysisResultView(event.target.value)}>{views.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <p className="analysis-phase-note">{view?.description}</p>
        </section>
      )}

      {versionMismatch && <section className="analysis-operation-message analysis-operation-message--warning">Este estudio usa la versión {resultVersion}; el diagrama actual está en la versión {currentVersion}. Sólo se muestran IDs que aún existen.</section>}

      <div className="analysis-stat-grid analysis-result-summary-grid">
        <div><span>Tensión mínima</span><strong>{formatResultNumber(summary.minimumVoltagePu, 4)} p.u.</strong></div>
        <div><span>Tensión máxima</span><strong>{formatResultNumber(summary.maximumVoltagePu, 4)} p.u.</strong></div>
        <div><span>Carga máxima</span><strong>{formatResultNumber(summary.maximumLoadingPercent, 2)} %</strong></div>
        <div><span>Demanda activa</span><strong>{formatPowerKw(summary.totalLoadActivePowerKw)}</strong></div>
        <div><span>Generación activa</span><strong>{formatPowerKw(summary.totalGenerationActivePowerKw)}</strong></div>
        <div><span>Pérdidas activas</span><strong>{formatPowerKw(summary.totalActiveLossKw)}</strong></div>
      </div>

      <section className="analysis-section-card analysis-visual-summary-card">
        <div>
          <h3>Visualización en el diagrama</h3>
          <p>Selecciona exactamente qué valores deben aparecer en las cajas desde la pestaña Etiquetas. Las cajas se mantienen compactas y pueden arrastrarse.</p>
        </div>
      </section>

      {["CONTINGENCY_N_1", "OPERATING_CASE_SWEEP", "LOADABILITY"].includes(result.analysisType) && (
        <section className="analysis-section-card analysis-section-card--wide"><h3>Resumen de escenarios</h3><AnalysisScenarioTable result={result} actions={actions} /></section>
      )}

      <section className="analysis-section-card analysis-section-card--wide">
        <div className="analysis-result-category-tabs">
          {RESULT_CATEGORIES.map(([id, label]) => <button key={id} type="button" className={category === id ? "active" : ""} onClick={() => setCategory(id)}>{label} <small>{Array.isArray(network[id]) ? network[id].length : 0}</small></button>)}
        </div>
        <ResultTable columns={columnsByCategory[category]} rows={rows} emptyMessage={`No existen resultados de ${RESULT_CATEGORIES.find(([id]) => id === category)?.[1].toLowerCase()} en esta vista.`} />
      </section>
    </div>
  );
}

export default function AnalysisPanel() {
  const editorData = useEditorSelector((state) => ({ document: state.document, analysisOverlay: state.ui.analysisOverlay }), shallowEqual);
  const document = editorData.document;
  const editorActions = useEditorActions();
  const { activeProject, activeDiagram, actions: workspaceActions } = useWorkspace();
  const [tab, setTab] = useState("execute");
  const projectSnapshot = useMemo(() => {
    if (!activeProject) return null;
    return {
      ...activeProject,
      diagrams: activeProject.diagrams.map((sheet) => (
        sheet.id === document.id ? { ...sheet, document } : sheet
      )),
    };
  }, [activeProject, document]);
  const analysisDocument = useMemo(
    () => buildProjectAnalysisDocument(projectSnapshot, activeDiagram?.id) ?? document,
    [activeDiagram?.id, document, projectSnapshot],
  );
  const validation = useMemo(() => evaluateAnalysisReadiness(analysisDocument), [analysisDocument]);
  const configuration = normalizeAnalysisConfiguration(document.analysisConfiguration);

  return (
    <aside className="properties-panel analysis-panel">
      <div className="panel-header analysis-panel-header"><div><span className="eyebrow">Ejecución y datos</span><h2>Análisis eléctricos</h2></div><button className="mini-button" type="button" onClick={editorActions.closeAnalysisPanel} title="Volver a propiedades">×</button></div>
      <div className="analysis-tabs" role="tablist">
        {[["execute", "Ejecutar"], ["results", "Resultados"], ["labels", "Etiquetas"], ["overview", "Preparación"], ["cases", "Casos"], ["configuration", "Solver"], ["model", "Modelo"]].map(([id, label]) => <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === "execute" && <ExecutionTab document={analysisDocument} sourceDocument={document} configuration={configuration} activeProject={activeProject} activeDiagram={activeDiagram} editorActions={editorActions} workspaceActions={workspaceActions} />}
      {tab === "results" && <ResultsTab overlay={editorData.analysisOverlay} actions={editorActions} activeDiagram={activeDiagram} document={document} />}
      {tab === "labels" && <LabelsTab overlay={editorData.analysisOverlay} actions={editorActions} />}
      {tab === "overview" && <OverviewTab document={analysisDocument} validation={validation} activeDiagram={activeDiagram} />}
      {tab === "cases" && <CasesTab document={document} validation={validation} actions={editorActions} canEdit={Boolean(activeProject?.canEdit)} />}
      {tab === "configuration" && <ConfigurationTab configuration={configuration} actions={editorActions} canEdit={Boolean(activeProject?.canEdit)} />}
      {tab === "model" && <ModelTab document={analysisDocument} validation={validation} activeDiagram={activeDiagram} />}
    </aside>
  );
}
