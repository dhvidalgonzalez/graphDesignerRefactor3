import { useMemo } from "react";
import { useWorkspace } from "../../workspace/WorkspaceContext.jsx";
import {
  buildProjectComponentCatalog,
  getEntityTerminalDescriptors,
  getStoredLogicalConnection,
  inferDiagramConnection,
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

function optionLabel(group, component, terminal) {
  const terminalSuffix = component.terminals.length > 1 ? ` / ${terminal.label}` : "";
  return `${group.diagramName} / ${component.componentName}${terminalSuffix}`;
}

export default function TerminalConnectionsEditor({
  document,
  entityKind,
  entityId,
  readOnly = false,
}) {
  const { activeProject } = useWorkspace();
  const actions = useEditorActions();
  const entity = entityKind === "edge"
    ? document.edges?.[entityId]
    : document.nodes?.[entityId];
  const terminals = getEntityTerminalDescriptors(document, entityKind, entityId);
  const unloadedDiagramCount = activeProject?.multiDiagram
    ? activeProject.diagrams.filter((sheet) => !sheet.document).length
    : 0;

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
    return projectSnapshot.multiDiagram
      ? groups
      : groups.filter((group) => group.diagramId === document.id);
  }, [document.id, projectSnapshot]);

  if (!entity || !terminals.length) return null;

  return (
    <section className="property-section terminal-connections-section">
      <div className="terminal-connections-heading">
        <div>
          <h3>Conexiones de terminales</h3>
          <p>
            Las conexiones dibujadas se reconocen automáticamente. En un proyecto multidiagrama puedes complementarlas con una referencia lógica hacia otra hoja.
          </p>
        </div>
        {activeProject?.multiDiagram && <span className="multi-diagram-chip">Multidiagrama</span>}
      </div>

      {unloadedDiagramCount > 0 && (
        <p className="terminal-connections-warning">
          Faltan {unloadedDiagramCount} hoja(s) por cargar. Cambia de hoja o vuelve a abrir el editor para completar el catálogo multidiagrama.
        </p>
      )}

      <div className="terminal-connection-list">
        {terminals.map((terminal) => {
          const manual = getStoredLogicalConnection(entity, terminal.key);
          const automatic = inferDiagramConnection(document, entityKind, entityId, terminal.key);
          const effective = manual ?? automatic;
          const effectiveValue = serializeLogicalConnectionReference(effective);
          const source = manual ? "MANUAL" : automatic ? "TOPOLOGY" : "NONE";

          return (
            <div className="terminal-connection-card" key={terminal.key}>
              <div className="terminal-connection-label">
                <span>{terminal.label}</span>
                <small>
                  {source === "MANUAL"
                    ? "Referencia lógica"
                    : source === "TOPOLOGY"
                      ? "Detectado desde el diagrama"
                      : "Sin conectar"}
                </small>
              </div>

              {readOnly ? (
                <strong className="terminal-connection-readonly">
                  {effective ? resolveProjectConnectionLabel(projectSnapshot, effective) : "Sin conexión"}
                </strong>
              ) : (
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
                  {catalog.map((group) => (
                    <optgroup key={group.diagramId} label={group.diagramName}>
                      {group.components.flatMap((component) => {
                        if (component.entityKind === entityKind && component.entityId === entityId && component.diagramId === document.id) {
                          return [];
                        }
                        return component.terminals.map((targetTerminal) => {
                          const reference = {
                            diagramId: component.diagramId,
                            entityKind: component.entityKind,
                            entityId: component.entityId,
                            terminalKey: targetTerminal.key,
                          };
                          return (
                            <option
                              key={serializeLogicalConnectionReference(reference)}
                              value={serializeLogicalConnectionReference(reference)}
                            >
                              {optionLabel(group, component, targetTerminal)}
                            </option>
                          );
                        });
                      })}
                    </optgroup>
                  ))}
                </select>
              )}

              {manual && !readOnly && (
                <button
                  className="terminal-connection-reset"
                  type="button"
                  onClick={() => actions.setEntityTerminalConnection(entityKind, entityId, terminal.key, null)}
                >
                  Volver a la topología dibujada
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
