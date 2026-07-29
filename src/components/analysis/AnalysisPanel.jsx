import { useCallback, useEffect, useMemo, useState } from "react";
import { createAnalysisInputPreview, createAnalysisRequestPreview } from "../../domain/analysis/createAnalysisInput.js";
import { evaluateAnalysisReadiness } from "../../domain/analysis/analysisReadiness.js";
import { normalizeAnalysisConfiguration } from "../../domain/analysis/analysisConfiguration.js";
import { getOperatingCase, normalizeOperatingCases } from "../../domain/analysis/operatingCases.js";
import { useEditorActions, useEditorSelector } from "../../editor/EditorContext.jsx";
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
          El modelo puede guardarse y enviarse al solver desde la pestaña Ejecutar. Los resultados se muestran inicialmente como JSON crudo.
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

  const loadArtifact = useCallback(async (study, type) => {
    if (!study?.id) return;
    setBusy(true);
    setError("");
    try {
      const loaded = await loadAnalysisArtifactTextService(study.id, type);
      setArtifactType(type);
      setArtifactText(loaded.text);
      setMessage(`${type.toLowerCase()} descargado desde S3.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  }, []);

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
            await loadArtifact(updated, "RESULT");
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
            <button key={study.id} type="button" className={currentStudy?.id === study.id ? "active" : ""} onClick={() => showStudy(study)}>
              <span className={`analysis-status analysis-status--${statusTone(study.status)}`}>{ANALYSIS_STATUS_LABELS[study.status] ?? study.status}</span>
              <strong>{study.name || "Flujo de carga"}</strong>
              <small>{formatStudyDate(study.requestedAt)}</small>
            </button>
          ))}
          {!historyLoading && !history.length && <p>No existen estudios para este diagrama.</p>}
          {historyLoading && <p>Cargando historial…</p>}
        </div>
      </section>
    </div>
  );
}

export default function AnalysisPanel() {
  const document = useEditorSelector((state) => state.document);
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
      {tab === "overview" && <OverviewTab document={document} validation={validation} activeDiagram={activeDiagram} />}
      {tab === "cases" && <CasesTab document={document} validation={validation} actions={editorActions} canEdit={Boolean(activeProject?.canEdit)} />}
      {tab === "configuration" && <ConfigurationTab configuration={configuration} actions={editorActions} canEdit={Boolean(activeProject?.canEdit)} />}
      {tab === "model" && <ModelTab document={document} validation={validation} activeDiagram={activeDiagram} />}
    </aside>
  );
}
