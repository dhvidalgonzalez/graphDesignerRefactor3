import { useCallback, useEffect, useMemo, useState } from "react";
import { createAnalysisInputPreview, createAnalysisRequestPreview } from "../../domain/analysis/createAnalysisInput.js";
import { evaluateAnalysisReadiness } from "../../domain/analysis/analysisReadiness.js";
import { normalizeAnalysisConfiguration } from "../../domain/analysis/analysisConfiguration.js";
import { getOperatingCase, normalizeOperatingCases } from "../../domain/analysis/operatingCases.js";
import {
  createAnalysisResultIndex,
  formatCurrentA,
  formatPowerKw,
  formatReactivePowerKvar,
  formatResultNumber,
  parseAnalysisResultText,
  voltagePuColor,
  loadingColor,
} from "../../domain/analysis/analysisResults.js";
import { shallowEqual, useEditorActions, useEditorSelector } from "../../editor/EditorContext.jsx";
import { useWorkspace } from "../../workspace/WorkspaceContext.jsx";
import { downloadTextFile, safeFilename } from "../../utils/download.js";
import {
  createAnalysisClientRequestId,
  getAnalysisStudyService,
  listAnalysisStudiesByDiagramService,
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
          <span>Análisis</span><strong>Flujo de carga AC balanceado</strong>
          <span>Caso por defecto</span><strong>{defaultCase.name}</strong>
          <span>Ejecución</span><strong>{configuration.defaultExecutionPreference}</strong>
          <span>Versión S3</span><strong>{activeDiagram?.storageVersion ?? "Sin sincronizar"}</strong>
          <span>Unidades</span><strong>1 unidad estándar</strong>
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

function ExecutionTab({
  document,
  validation,
  configuration,
  activeProject,
  activeDiagram,
  editorActions,
  workspaceActions,
}) {
  const cases = normalizeOperatingCases(document.operatingCases);
  const defaultCase = cases.find((item) => item.isDefault) ?? cases[0];
  const defaultPreference = configuration.defaultExecutionPreference === "ADVANCED"
    ? "AUTO"
    : configuration.defaultExecutionPreference;
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

  useEffect(() => {
    if (!cases.some((item) => item.id === selectedCaseId)) {
      setSelectedCaseId(defaultCase.id);
    }
  }, [cases, defaultCase.id, selectedCaseId]);

  const refreshHistory = useCallback(async () => {
    if (!activeDiagram?.id) return [];
    setHistoryLoading(true);
    try {
      const studies = await listAnalysisStudiesByDiagramService(activeDiagram.id);
      setHistory(studies);
      return studies;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      return [];
    } finally {
      setHistoryLoading(false);
    }
  }, [activeDiagram?.id]);

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
        if (parsed.diagramId !== activeDiagram?.id) {
          throw new Error("El resultado pertenece a otro diagrama y no puede activarse en esta vista.");
        }
        if (activate) {
          editorActions.activateAnalysisResult(study, parsed);
          setMessage("Resultado activo sobre el diagrama.");
        } else {
          setMessage("result.json descargado desde S3.");
        }
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
  }, [activeDiagram?.id, editorActions]);

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
          } else if (updated.diagnosticsStorageKey) {
            await loadArtifact(updated, "DIAGNOSTICS");
          }
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : String(nextError));
        }
      }
    };

    const timer = window.setInterval(poll, 2500);
    poll();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currentStudy?.id, currentStudy?.status, loadArtifact, refreshHistory]);

  const runAnalysis = async () => {
    if (!activeProject?.id || !activeDiagram?.id) return;
    setBusy(true);
    setError("");
    setMessage("Guardando la versión actual del diagrama…");
    try {
      editorActions.setPersistence("saving", "Guardando antes del análisis");
      const saved = await workspaceActions.saveDiagramDocument(
        activeProject.id,
        activeDiagram.id,
        document,
      );
      editorActions.setPersistence("saved", "Guardado en la nube");
      setMessage("Creando el estudio y enviándolo al solver…");

      const request = await startAnalysisService({
        diagramId: activeDiagram.id,
        operatingCaseId: selectedCaseId,
        analysisType: "POWER_FLOW",
        executionPreference,
        expectedDiagramVersion: Number(saved.storageVersion),
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
  const canRun = Boolean(
    activeProject?.canEdit &&
    activeDiagram?.id &&
    validation.readiness !== "NOT_READY" &&
    !busy,
  );
  const status = currentStudy?.status;
  const isTerminal = Boolean(status && TERMINAL_ANALYSIS_STATUSES.has(status));

  return (
    <div className="analysis-tab-content">
      <AnalysisSummary validation={validation} />

      <section className="analysis-section-card analysis-run-card">
        <h3>Ejecutar flujo de carga</h3>
        <label className="property-field">
          <span>Nombre del estudio</span>
          <input
            value={studyName}
            onChange={(event) => setStudyName(event.target.value)}
            placeholder={`Flujo de carga · ${document.name}`}
          />
        </label>
        <label className="property-field">
          <span>Caso de operación</span>
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
        <div className="read-only-grid analysis-run-summary">
          <span>Análisis</span><strong>POWER_FLOW</strong>
          <span>Algoritmo</span><strong>{configuration.solverOptions.algorithm}</strong>
          <span>Versión actual</span><strong>{activeDiagram?.storageVersion ?? 0}</strong>
          <span>Unidades reservadas</span><strong>1</strong>
        </div>
        <button className="button button--primary analysis-run-button" type="button" disabled={!canRun} onClick={runAnalysis}>
          {busy ? "Procesando…" : "Guardar y ejecutar análisis"}
        </button>
        {!activeProject?.canEdit && <p className="analysis-phase-note">Se necesita permiso de edición para ejecutar estudios.</p>}
        {validation.readiness === "NOT_READY" && <p className="analysis-phase-note analysis-phase-note--error">Corrige los errores bloqueantes antes de ejecutar.</p>}
      </section>

      {(message || error) && (
        <section className={`analysis-operation-message ${error ? "analysis-operation-message--error" : ""}`}>
          {error || message}
        </section>
      )}

      {currentStudy && (
        <section className="analysis-section-card">
          <div className="analysis-study-heading">
            <div>
              <h3>Estudio actual</h3>
              <code>{currentStudy.id}</code>
            </div>
            <span className={`analysis-status analysis-status--${statusTone(currentStudy.status)}`}>
              {ANALYSIS_STATUS_LABELS[currentStudy.status] ?? currentStudy.status}
            </span>
          </div>
          <div className="read-only-grid">
            <span>Solicitado</span><strong>{formatStudyDate(currentStudy.requestedAt)}</strong>
            <span>Inicio</span><strong>{formatStudyDate(currentStudy.startedAt)}</strong>
            <span>Término</span><strong>{formatStudyDate(currentStudy.completedAt)}</strong>
            <span>Motor</span><strong>{currentStudy.engineName || "Pendiente"} {currentStudy.engineVersion || ""}</strong>
            <span>Fallo</span><strong>{currentStudy.failureCode || "—"}</strong>
          </div>
          {currentStudy.failureMessage && (
            <p className="analysis-study-failure">{currentStudy.failureMessage}</p>
          )}
          <div className="analysis-toolbar-row analysis-artifact-actions">
            <button className="button button--soft" type="button" onClick={() => showStudy(currentStudy)}>Registro</button>
            <button className="button button--soft" type="button" disabled={!currentStudy.inputStorageKey || busy} onClick={() => loadArtifact(currentStudy, "INPUT")}>Input</button>
            <button className="button button--soft" type="button" disabled={!isTerminal || !currentStudy.resultStorageKey || busy} onClick={() => loadArtifact(currentStudy, "RESULT")}>Resultado</button>
            <button className="button button--primary" type="button" disabled={!isTerminal || !currentStudy.resultStorageKey || busy} onClick={() => loadArtifact(currentStudy, "RESULT", { activate: true })}>Activar en diagrama</button>
            <button className="button button--soft" type="button" disabled={!isTerminal || !currentStudy.diagnosticsStorageKey || busy} onClick={() => loadArtifact(currentStudy, "DIAGNOSTICS")}>Diagnóstico</button>
          </div>
        </section>
      )}

      {artifactText && (
        <section className="analysis-section-card analysis-raw-result">
          <div className="analysis-raw-result-header">
            <h3>Contenido crudo · {artifactType}</h3>
            <button
              className="button button--soft"
              type="button"
              onClick={() => downloadTextFile(
                `${safeFilename(document.name)}-${currentStudy?.id || "analysis"}-${artifactType.toLowerCase()}.json`,
                artifactText,
              )}
            >
              Descargar
            </button>
          </div>
          <pre className="analysis-code-preview analysis-code-preview--result">{artifactText}</pre>
        </section>
      )}

      <section className="analysis-section-card">
        <div className="analysis-history-heading">
          <h3>Estudios recientes</h3>
          <button className="mini-button" type="button" disabled={historyLoading} onClick={refreshHistory} title="Actualizar historial">↻</button>
        </div>
        <div className="analysis-study-list">
          {history.map((study) => (
            <div key={study.id} className={currentStudy?.id === study.id ? "active" : ""}>
              <button type="button" className="analysis-study-main" onClick={() => showStudy(study)}>
                <span className={`analysis-status analysis-status--${statusTone(study.status)}`}>{ANALYSIS_STATUS_LABELS[study.status] ?? study.status}</span>
                <strong>{study.name || "Flujo de carga"}</strong>
                <small>{formatStudyDate(study.requestedAt)}</small>
              </button>
              {study.resultStorageKey && ["CONVERGED", "NOT_CONVERGED"].includes(study.status) && (
                <button
                  className="analysis-study-activate"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    showStudy(study);
                    loadArtifact(study, "RESULT", { activate: true });
                  }}
                >
                  Mostrar
                </button>
              )}
            </div>
          ))}
          {!historyLoading && !history.length && <p>No existen estudios para este diagrama.</p>}
          {historyLoading && <p>Cargando historial…</p>}
        </div>
      </section>
    </div>
  );
}

function OverlayOption({ checked, label, onChange }) {
  return (
    <label className="analysis-overlay-option">
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function ResultTable({ columns, rows, emptyMessage }) {
  if (!rows.length) return <p className="analysis-empty-result">{emptyMessage}</p>;
  return (
    <div className="analysis-results-table-wrap">
      <table className="analysis-results-table">
        <thead>
          <tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.componentId || row.connectionNodeId || row.busId || `${row.code}-${rowIndex}`}>
              {columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : row[column.key] ?? "—"}</td>)}
            </tr>
          ))}
        </tbody>
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

function ResultsTab({ overlay, actions, activeDiagram, document }) {
  const [category, setCategory] = useState("buses");
  const result = overlay?.result;
  const options = overlay?.options ?? {};
  const resultIndex = useMemo(
    () => (result && document ? createAnalysisResultIndex(document, result) : null),
    [document, result],
  );
  if (!result) {
    return (
      <div className="analysis-tab-content">
        <section className="analysis-section-card analysis-empty-active-study">
          <h3>No hay un estudio activo</h3>
          <p>Abre la pestaña Ejecutar y activa el resultado de un estudio convergente. Los resultados se descargarán desde S3 y se montarán sobre este mismo diagrama.</p>
        </section>
      </div>
    );
  }

  const summary = result.summary ?? {};
  const rows = Array.isArray(result[category]) ? result[category] : [];
  const componentLabel = (componentId) => {
    const entity = document?.nodes?.[componentId] ?? document?.edges?.[componentId];
    return entity?.properties?.name ? `${entity.properties.name} · ${componentId}` : componentId || "—";
  };
  const busLabel = (row) => {
    const connectionNode = resultIndex?.connectionNodeById.get(row.connectionNodeId)
      ?? resultIndex?.connectionNodeById.get(row.busId)
      ?? resultIndex?.connectionNodeByBusComponentId.get(row.busId);
    const visualNodeId = connectionNode?.busComponentId || (document?.nodes?.[row.busId] ? row.busId : null);
    const visualNode = visualNodeId ? document?.nodes?.[visualNodeId] : null;
    return visualNode?.properties?.name
      ? `${visualNode.properties.name} · ${row.busId}`
      : row.busId || row.connectionNodeId || "—";
  };
  const resultVersion = Number(result.diagramStorageVersion ?? overlay.study?.inputDiagramVersion);
  const currentVersion = Number(activeDiagram?.storageVersion);
  const versionMismatch = Number.isFinite(resultVersion)
    && Number.isFinite(currentVersion)
    && resultVersion !== currentVersion;
  const columnsByCategory = {
    buses: [
      { key: "status", label: "", render: (row) => <span className="analysis-result-color-dot" style={{ background: voltagePuColor(row.voltagePu, row.status) }} title={row.status} /> },
      { key: "busId", label: "Barra", render: busLabel },
      { key: "voltageKv", label: "kV", render: (row) => formatResultNumber(row.voltageKv, 3) },
      { key: "voltagePu", label: "p.u.", render: (row) => formatResultNumber(row.voltagePu, 4) },
      { key: "angleDeg", label: "Ángulo", render: (row) => `${formatResultNumber(row.angleDeg, 3)}°` },
      { key: "activePowerInjectionKw", label: "P inyección", render: (row) => formatPowerKw(row.activePowerInjectionKw) },
      { key: "reactivePowerInjectionKvar", label: "Q inyección", render: (row) => formatReactivePowerKvar(row.reactivePowerInjectionKvar) },
      { key: "statusText", label: "Estado", render: (row) => row.status || "—" },
    ],
    branches: [
      { key: "status", label: "", render: (row) => <span className="analysis-result-color-dot" style={{ background: loadingColor(row.loadingPercent, row.status) }} title={row.status} /> },
      { key: "componentId", label: "Línea", render: (row) => componentLabel(row.componentId) },
      { key: "activePowerFromKw", label: "P origen", render: (row) => formatPowerKw(row.activePowerFromKw) },
      { key: "reactivePowerFromKvar", label: "Q origen", render: (row) => formatReactivePowerKvar(row.reactivePowerFromKvar) },
      { key: "currentFromA", label: "Corriente", render: (row) => formatCurrentA(row.currentFromA) },
      { key: "loadingPercent", label: "Carga", render: (row) => `${formatResultNumber(row.loadingPercent, 2)} %` },
      { key: "activeLossKw", label: "Pérdidas", render: (row) => formatPowerKw(row.activeLossKw) },
      { key: "direction", label: "Dirección" },
    ],
    transformers: [
      { key: "componentId", label: "Transformador", render: (row) => componentLabel(row.componentId) },
      { key: "primaryVoltageKv", label: "Primario", render: (row) => `${formatResultNumber(row.primaryVoltageKv, 3)} kV` },
      { key: "secondaryVoltageKv", label: "Secundario", render: (row) => `${formatResultNumber(row.secondaryVoltageKv, 3)} kV` },
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
      { key: "voltagePu", label: "Tensión", render: (row) => row.voltagePu == null ? "—" : `${formatResultNumber(row.voltagePu, 4)} p.u.` },
      { key: "inService", label: "Servicio", render: (row) => row.inService ? "Sí" : "No" },
    ],
    loads: [
      { key: "componentId", label: "Carga", render: (row) => componentLabel(row.componentId) },
      { key: "activePowerKw", label: "P", render: (row) => formatPowerKw(row.activePowerKw) },
      { key: "reactivePowerKvar", label: "Q", render: (row) => formatReactivePowerKvar(row.reactivePowerKvar) },
      { key: "busId", label: "Barra" },
      { key: "inService", label: "Servicio", render: (row) => row.inService ? "Sí" : "No" },
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
          <div>
            <span className="eyebrow">Resultado activo</span>
            <h3>{overlay.study?.name || "Flujo de carga"}</h3>
            <code>{result.studyId}</code>
          </div>
          <button className="mini-button danger-outline" type="button" onClick={actions.clearActiveAnalysisResult} title="Quitar resultados">×</button>
        </div>
        <div className="read-only-grid">
          <span>Caso</span><strong>{result.operatingCaseId || overlay.study?.operatingCaseId || "—"}</strong>
          <span>Versión</span><strong>{result.diagramStorageVersion ?? overlay.study?.inputDiagramVersion ?? "—"}</strong>
          <span>Motor</span><strong>{result.engine?.name || overlay.study?.engineName || "—"} {result.engine?.version || ""}</strong>
          <span>Convergencia</span><strong>{result.convergence?.converged ? "Convergió" : "No convergió"}</strong>
          <span>Iteraciones</span><strong>{result.convergence?.iterations ?? "—"}</strong>
          <span>Duración</span><strong>{result.convergence?.durationMs != null ? `${formatResultNumber(result.convergence.durationMs, 0)} ms` : "—"}</strong>
        </div>
      </section>

      {versionMismatch && (
        <section className="analysis-operation-message analysis-operation-message--warning">
          Este estudio fue calculado con la versión {resultVersion}, mientras el diagrama actual está en la versión {currentVersion}. Se muestran los resultados sobre los IDs que todavía existen.
        </section>
      )}

      <div className="analysis-stat-grid analysis-result-summary-grid">
        <div><span>Tensión mínima</span><strong>{formatResultNumber(summary.minimumVoltagePu, 4)} p.u.</strong></div>
        <div><span>Tensión máxima</span><strong>{formatResultNumber(summary.maximumVoltagePu, 4)} p.u.</strong></div>
        <div><span>Carga máxima</span><strong>{formatResultNumber(summary.maximumLoadingPercent, 2)} %</strong></div>
        <div><span>Demanda activa</span><strong>{formatPowerKw(summary.totalLoadActivePowerKw)}</strong></div>
        <div><span>Generación activa</span><strong>{formatPowerKw(summary.totalGenerationActivePowerKw)}</strong></div>
        <div><span>Pérdidas activas</span><strong>{formatPowerKw(summary.totalActiveLossKw)}</strong></div>
      </div>

      <section className="analysis-section-card">
        <h3>Capa visual</h3>
        <div className="analysis-overlay-controls">
          <OverlayOption checked={options.visible} label="Mostrar resultados" onChange={(value) => actions.updateAnalysisOverlayOptions({ visible: value })} />
          <OverlayOption checked={options.colorBusesByVoltage} label="Colorear barras por tensión" onChange={(value) => actions.updateAnalysisOverlayOptions({ colorBusesByVoltage: value })} />
          <OverlayOption checked={options.colorBranchesByLoading} label="Colorear líneas por carga" onChange={(value) => actions.updateAnalysisOverlayOptions({ colorBranchesByLoading: value })} />
          <OverlayOption checked={options.showBusVoltages} label="Tensiones de barras" onChange={(value) => actions.updateAnalysisOverlayOptions({ showBusVoltages: value })} />
          <OverlayOption checked={options.showBusAngles} label="Ángulos" onChange={(value) => actions.updateAnalysisOverlayOptions({ showBusAngles: value })} />
          <OverlayOption checked={options.showActivePowerFlows} label="Potencia activa" onChange={(value) => actions.updateAnalysisOverlayOptions({ showActivePowerFlows: value })} />
          <OverlayOption checked={options.showReactivePowerFlows} label="Potencia reactiva" onChange={(value) => actions.updateAnalysisOverlayOptions({ showReactivePowerFlows: value })} />
          <OverlayOption checked={options.showCurrents} label="Corrientes" onChange={(value) => actions.updateAnalysisOverlayOptions({ showCurrents: value })} />
          <OverlayOption checked={options.showLoading} label="Cargabilidad" onChange={(value) => actions.updateAnalysisOverlayOptions({ showLoading: value })} />
          <OverlayOption checked={options.showLosses} label="Pérdidas" onChange={(value) => actions.updateAnalysisOverlayOptions({ showLosses: value })} />
          <OverlayOption checked={options.showFlowArrows} label="Flechas de flujo" onChange={(value) => actions.updateAnalysisOverlayOptions({ showFlowArrows: value })} />
          <OverlayOption checked={options.showEquipmentPower} label="Potencia en equipos" onChange={(value) => actions.updateAnalysisOverlayOptions({ showEquipmentPower: value })} />
        </div>
        <div className="analysis-voltage-legend" aria-label="Escala de tensión por unidad">
          <span style={{ background: "#dc2626" }}>≤ 0,90</span>
          <span style={{ background: "#f97316" }}>0,90–0,95</span>
          <span style={{ background: "#eab308" }}>0,95–0,98</span>
          <span style={{ background: "#16a34a" }}>0,98–1,02</span>
          <span style={{ background: "#0284c7" }}>1,02–1,05</span>
          <span style={{ background: "#7c3aed" }}>&gt; 1,05</span>
        </div>
      </section>

      <section className="analysis-section-card analysis-section-card--wide">
        <div className="analysis-result-category-tabs">
          {RESULT_CATEGORIES.map(([id, label]) => (
            <button key={id} type="button" className={category === id ? "active" : ""} onClick={() => setCategory(id)}>
              {label} <small>{Array.isArray(result[id]) ? result[id].length : 0}</small>
            </button>
          ))}
        </div>
        <ResultTable
          columns={columnsByCategory[category]}
          rows={rows}
          emptyMessage={`No existen resultados de ${RESULT_CATEGORIES.find(([id]) => id === category)?.[1].toLowerCase()} en este estudio.`}
        />
      </section>
    </div>
  );
}

export default function AnalysisPanel() {
  const editorData = useEditorSelector((state) => ({
    document: state.document,
    analysisOverlay: state.ui.analysisOverlay,
  }), shallowEqual);
  const document = editorData.document;
  const editorActions = useEditorActions();
  const {
    activeProject,
    activeDiagram,
    actions: workspaceActions,
  } = useWorkspace();
  const [tab, setTab] = useState("execute");
  const validation = useMemo(() => evaluateAnalysisReadiness(document), [document]);
  const configuration = normalizeAnalysisConfiguration(document.analysisConfiguration);

  return (
    <aside className="properties-panel analysis-panel">
      <div className="panel-header analysis-panel-header">
        <div><span className="eyebrow">Ejecución y datos</span><h2>Análisis eléctricos</h2></div>
        <button className="mini-button" type="button" onClick={editorActions.closeAnalysisPanel} title="Volver a propiedades">×</button>
      </div>
      <div className="analysis-tabs" role="tablist">
        {[
          ["execute", "Ejecutar"],
          ["results", "Resultados"],
          ["overview", "Preparación"],
          ["cases", "Casos"],
          ["configuration", "Solver"],
          ["model", "Modelo"],
        ].map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === "execute" && (
        <ExecutionTab
          document={document}
          validation={validation}
          configuration={configuration}
          activeProject={activeProject}
          activeDiagram={activeDiagram}
          editorActions={editorActions}
          workspaceActions={workspaceActions}
        />
      )}
      {tab === "results" && <ResultsTab overlay={editorData.analysisOverlay} actions={editorActions} activeDiagram={activeDiagram} document={document} />}
      {tab === "overview" && <OverviewTab document={document} validation={validation} activeDiagram={activeDiagram} />}
      {tab === "cases" && <CasesTab document={document} validation={validation} actions={editorActions} canEdit={Boolean(activeProject?.canEdit)} />}
      {tab === "configuration" && <ConfigurationTab configuration={configuration} actions={editorActions} canEdit={Boolean(activeProject?.canEdit)} />}
      {tab === "model" && <ModelTab document={document} validation={validation} activeDiagram={activeDiagram} />}
    </aside>
  );
}
