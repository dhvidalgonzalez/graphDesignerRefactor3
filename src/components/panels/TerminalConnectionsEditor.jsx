import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "../../workspace/WorkspaceContext.jsx";
import {
  buildProjectComponentCatalog,
  getEntityTerminalDescriptors,
  getStoredLogicalConnection,
  inferDiagramConnection,
  isSharedCrossDiagramComponent,
  parseLogicalConnectionReference,
  resolveProjectConnectionLabel,
  serializeLogicalConnectionReference,
} from "../../domain/electrical/projectTopology.js";
import { useEditorActions } from "../../editor/EditorContext.jsx";

function sameReference(left, right) {
  return Boolean(left && right)
    && left.diagramId === right.diagramId
    && left.entityKind === right.entityKind
    && left.entityId === right.entityId
    && left.terminalKey === right.terminalKey;
}

function optionLabel(component, terminal, { includeDiagram = false } = {}) {
  const terminalSuffix = component.terminals.length > 1 ? ` / ${terminal.label}` : "";
  const prefix = includeDiagram ? `${component.diagramName} / ` : "";
  return `${prefix}${component.componentName}${terminalSuffix}`;
}

function referenceFor(component, terminal) {
  return {
    diagramId: component.diagramId,
    entityKind: component.entityKind,
    entityId: component.entityId,
    terminalKey: terminal.key,
  };
}

function findCatalogTarget(catalog, reference) {
  if (!reference) return null;
  for (const group of catalog) {
    const component = group.components.find((item) => (
      item.entityKind === reference.entityKind
      && item.entityId === reference.entityId
      && item.diagramId === reference.diagramId
    ));
    const terminal = component?.terminals.find((item) => item.key === reference.terminalKey);
    if (component && terminal) return { group, component, terminal };
  }
  return null;
}

function TargetOptions({ components, current, includeDiagram = false }) {
  return components.flatMap((component) => {
    if (
      component.entityKind === current.entityKind
      && component.entityId === current.entityId
      && component.diagramId === current.diagramId
    ) {
      return [];
    }
    return component.terminals.map((terminal) => {
      const reference = referenceFor(component, terminal);
      return (
        <option
          key={serializeLogicalConnectionReference(reference)}
          value={serializeLogicalConnectionReference(reference)}
        >
          {optionLabel(component, terminal, { includeDiagram })}
        </option>
      );
    });
  });
}

export default function TerminalConnectionsEditor({
  document,
  entityKind,
  entityId,
  readOnly = false,
  compact = false,
}) {
  const {
    activeProject,
    connectionCatalogStatus,
    connectionCatalogProgress,
    connectionCatalogError,
    actions: workspaceActions,
  } = useWorkspace();
  const actions = useEditorActions();
  const [showShared, setShowShared] = useState(false);
  const entity = entityKind === "edge"
    ? document.edges?.[entityId]
    : document.nodes?.[entityId];
  const terminals = getEntityTerminalDescriptors(document, entityKind, entityId);
  const isBus = entityKind === "node" && entity?.type === "ElmTerm";
  const isMultiDiagram = Boolean(activeProject?.multiDiagram);
  const missingCatalogCount = isMultiDiagram
    ? activeProject.diagrams.filter((sheet) => !sheet.document && !sheet.connectionCatalog).length
    : 0;

  useEffect(() => {
    setShowShared(false);
  }, [document.id, entityId, entityKind]);

  useEffect(() => {
    if (
      isMultiDiagram
      && missingCatalogCount > 0
      && connectionCatalogStatus === "idle"
    ) {
      workspaceActions.refreshProjectConnectionCatalog().catch(() => {});
    }
  }, [
    connectionCatalogStatus,
    isMultiDiagram,
    missingCatalogCount,
    workspaceActions,
  ]);

  const projectSnapshot = useMemo(() => {
    if (!activeProject) return null;
    return {
      ...activeProject,
      diagrams: activeProject.diagrams.map((sheet) => (
        sheet.id === document.id ? { ...sheet, document } : sheet
      )),
    };
  }, [activeProject, document]);

  const catalog = useMemo(() => {
    if (!projectSnapshot) return [];
    const groups = buildProjectComponentCatalog(projectSnapshot);
    return isMultiDiagram
      ? groups
      : groups.filter((group) => group.diagramId === document.id);
  }, [document.id, isMultiDiagram, projectSnapshot]);

  const localComponents = useMemo(
    () => catalog.find((group) => group.diagramId === document.id)?.components ?? [],
    [catalog, document.id],
  );
  const sharedGroups = useMemo(
    () => catalog
      .filter((group) => group.diagramId !== document.id)
      .map((group) => ({
        ...group,
        components: group.components.filter(isSharedCrossDiagramComponent),
      }))
      .filter((group) => group.components.length),
    [catalog, document.id],
  );
  const sharedCount = sharedGroups.reduce(
    (sum, group) => sum + group.components.length,
    0,
  );

  const connectionRows = useMemo(() => terminals.map((terminal) => {
    const manual = getStoredLogicalConnection(entity, terminal.key);
    const automatic = inferDiagramConnection(document, entityKind, entityId, terminal.key);
    const effective = manual ?? automatic;
    return {
      terminal,
      manual,
      automatic,
      effective,
      effectiveValue: serializeLogicalConnectionReference(effective),
      source: manual ? "MANUAL" : automatic ? "TOPOLOGY" : "NONE",
    };
  }), [document, entity, entityId, entityKind, terminals]);

  const hasExternalConnection = connectionRows.some(
    (row) => row.effective?.diagramId && row.effective.diagramId !== document.id,
  );
  useEffect(() => {
    if (hasExternalConnection) setShowShared(true);
  }, [hasExternalConnection]);

  if (!entity || !terminals.length) return null;

  return (
    <section className={`property-section terminal-connections-section ${compact ? "terminal-connections-section--compact" : ""}`}>
      <div className="terminal-connections-heading">
        <div>
          <span className="eyebrow">Topología</span>
          <h3>Conexiones</h3>
          <p>
            La hoja actual se conecta normalmente desde el dibujo. Las referencias entre hojas sólo muestran barras que otro diagrama publicó como compartidas.
          </p>
        </div>
        {isMultiDiagram && <span className="multi-diagram-chip">Multidiagrama</span>}
      </div>

      {isMultiDiagram && isBus && (
        <label className="shared-component-publisher">
          <input
            type="checkbox"
            disabled={readOnly}
            checked={Boolean(entity.properties?.crossDiagramVisible)}
            onChange={(event) => actions.updateNodeProperties(entity.id, {
              crossDiagramVisible: event.target.checked,
            })}
          />
          <span>
            <strong>Disponible desde otros diagramas</strong>
            <small>
              Publica esta barra en el catálogo compartido del proyecto. Su nombre no define la identidad eléctrica; la conexión se crea al seleccionarla desde otra hoja.
            </small>
          </span>
        </label>
      )}

      {isMultiDiagram && !readOnly && (
        <div className="terminal-connection-toolbar">
          <label className="terminal-shared-filter">
            <input
              type="checkbox"
              checked={showShared}
              onChange={(event) => setShowShared(event.target.checked)}
            />
            <span>Mostrar componentes compartidos</span>
            <strong>{sharedCount}</strong>
          </label>
          {connectionCatalogStatus === "loading" && (
            <span className="terminal-catalog-status">
              <span className="inline-spinner" aria-hidden="true" />
              {connectionCatalogProgress
                ? `${connectionCatalogProgress.completed}/${connectionCatalogProgress.total} hojas`
                : "Actualizando catálogo"}
            </span>
          )}
        </div>
      )}

      {connectionCatalogStatus === "error" && (
        <div className="terminal-connections-warning terminal-connections-warning--error">
          <span>No fue posible cargar las barras compartidas: {connectionCatalogError?.message || "error desconocido"}.</span>
          <button
            className="button button--soft"
            type="button"
            onClick={() => workspaceActions.refreshProjectConnectionCatalog({ force: true }).catch(() => {})}
          >
            Reintentar
          </button>
        </div>
      )}

      {missingCatalogCount > 0 && connectionCatalogStatus !== "loading" && connectionCatalogStatus !== "error" && (
        <p className="terminal-connections-warning">
          Faltan {missingCatalogCount} hoja(s) por incorporar al catálogo compartido.
        </p>
      )}

      <div className="terminal-connection-list">
        {connectionRows.map(({ terminal, manual, automatic, effective, effectiveValue, source }) => {
          const currentExternalTarget = effective?.diagramId !== document.id
            ? findCatalogTarget(catalog, effective)
            : null;
          const externalTargetIsPublished = Boolean(
            currentExternalTarget
            && isSharedCrossDiagramComponent(currentExternalTarget.component),
          );
          const currentIdentity = {
            diagramId: document.id,
            entityKind,
            entityId,
          };

          return (
            <div className="terminal-connection-card" key={terminal.key}>
              <div className="terminal-connection-label">
                <div>
                  <span>{terminal.label}</span>
                  <small>
                    {source === "MANUAL"
                      ? effective?.diagramId === document.id
                        ? "Referencia definida en esta hoja"
                        : "Referencia compartida entre hojas"
                      : source === "TOPOLOGY"
                        ? "Detectada desde el dibujo"
                        : "Terminal sin conexión"}
                  </small>
                </div>
                <span className={`terminal-connection-source terminal-connection-source--${source.toLowerCase()}`}>
                  {source === "MANUAL" ? "Lógica" : source === "TOPOLOGY" ? "Dibujo" : "Vacía"}
                </span>
              </div>

              {readOnly ? (
                <strong className="terminal-connection-readonly">
                  {effective ? resolveProjectConnectionLabel(projectSnapshot, effective) : "Sin conexión"}
                </strong>
              ) : (
                <label className="terminal-connection-select-field">
                  <span>Componente conectado</span>
                  <select
                    value={effectiveValue}
                    onChange={(event) => {
                      const selected = parseLogicalConnectionReference(event.target.value);
                      actions.setEntityTerminalConnection(
                        entityKind,
                        entityId,
                        terminal.key,
                        sameReference(selected, automatic) ? null : selected,
                      );
                    }}
                  >
                    <option value="">Sin conexión lógica</option>
                    <optgroup label="Componentes del diagrama actual">
                      <TargetOptions
                        components={localComponents}
                        current={currentIdentity}
                      />
                    </optgroup>
                    {showShared && sharedGroups.map((group) => (
                      <optgroup
                        key={`shared-${group.diagramId}`}
                        label={`Compartidos · ${group.diagramName}`}
                      >
                        <TargetOptions
                          components={group.components}
                          current={currentIdentity}
                          includeDiagram={false}
                        />
                      </optgroup>
                    ))}
                    {currentExternalTarget && !externalTargetIsPublished && (
                      <optgroup label="Conexión externa existente">
                        <option value={effectiveValue}>
                          {optionLabel(currentExternalTarget.component, currentExternalTarget.terminal, { includeDiagram: true })} · no publicada
                        </option>
                      </optgroup>
                    )}
                  </select>
                </label>
              )}

              {showShared && sharedCount === 0 && connectionCatalogStatus !== "loading" && !readOnly && (
                <p className="terminal-shared-empty">
                  Ninguna barra de las otras hojas está marcada como disponible desde otros diagramas.
                </p>
              )}

              {manual && !readOnly && (
                <button
                  className="terminal-connection-reset"
                  type="button"
                  onClick={() => actions.setEntityTerminalConnection(entityKind, entityId, terminal.key, null)}
                >
                  <span aria-hidden="true">↩</span>
                  Volver a la conexión detectada en el dibujo
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
