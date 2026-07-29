import { getSymbolDefinition } from "../../domain/catalog/symbolCatalog.js";
import { getVoltageLevel } from "../../domain/electrical/voltageLevels.js";
import { shallowEqual, useEditorSelector } from "../../editor/EditorContext.jsx";

function displayValue(value, document) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "—";
  if (typeof value === "string" && value.startsWith("vl-")) {
    return getVoltageLevel(document.metadata, value)?.label ?? value;
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function PropertyRows({ entries, document }) {
  const visible = entries.filter(([, value]) => value != null && value !== "");
  if (!visible.length) return <p>No hay propiedades adicionales registradas.</p>;

  return (
    <div className="read-only-property-list">
      {visible.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{displayValue(value, document)}</strong>
        </div>
      ))}
    </div>
  );
}

export default function ReadOnlyPropertiesPanel() {
  const { document, selection } = useEditorSelector(
    (state) => ({
      document: state.document,
      selection: state.selection,
    }),
    shallowEqual,
  );

  const selectedNodes = selection.nodeIds
    .map((id) => document.nodes[id])
    .filter(Boolean);
  const selectedEdge = selection.edgeId
    ? document.edges[selection.edgeId]
    : null;

  if (selectedNodes.length === 1) {
    const node = selectedNodes[0];
    const definition = getSymbolDefinition(node.type);
    const fieldEntries = definition.fields.map((field) => [
      field.label,
      node.properties[field.key],
    ]);
    const knownKeys = new Set(definition.fields.map((field) => field.key));
    const electricalEntries = Object.entries(node.properties)
      .filter(([key]) => !knownKeys.has(key))
      .map(([key, value]) => [key, value]);

    return (
      <aside className="properties-panel properties-panel--readonly">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Inspección de componente</span>
            <h2>{definition.displayName}</h2>
          </div>
          <span className="type-chip">{definition.shortLabel}</span>
        </div>

        <section className="property-section">
          <h3>Representación</h3>
          <div className="read-only-grid">
            <span>X</span><strong>{node.position.x.toFixed(2)}</strong>
            <span>Y</span><strong>{node.position.y.toFixed(2)}</strong>
            <span>Rotación</span><strong>{node.rotation ?? 0}°</strong>
          </div>
        </section>

        <section className="property-section">
          <h3>Propiedades del diagrama</h3>
          <PropertyRows entries={fieldEntries} document={document} />
        </section>

        {definition.electrical !== false && (
          <section className="property-section property-section--electric">
            <div className="section-heading-row">
              <div>
                <span className="eyebrow">Modelo eléctrico</span>
                <h3>Datos registrados</h3>
              </div>
              <span>⚡</span>
            </div>
            <PropertyRows entries={electricalEntries} document={document} />
          </section>
        )}

        <section className="property-section property-section--muted">
          <h3>Modo de lectura</h3>
          <p>Estos valores son informativos y no pueden modificarse con tu permiso actual.</p>
        </section>
      </aside>
    );
  }

  if (selectedNodes.length > 1) {
    return (
      <aside className="properties-panel properties-panel--readonly">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Selección múltiple</span>
            <h2>{selectedNodes.length} componentes</h2>
          </div>
        </div>
        <section className="property-section">
          <p>Puedes seleccionar equipos para revisar su ubicación, pero no moverlos ni modificar sus propiedades.</p>
        </section>
      </aside>
    );
  }

  if (selectedEdge) {
    const source = document.nodes[selectedEdge.source.nodeId];
    const target = document.nodes[selectedEdge.target.nodeId];
    const voltage = getVoltageLevel(
      document.metadata,
      selectedEdge.properties.voltageLevelId,
    );

    return (
      <aside className="properties-panel properties-panel--readonly">
        <div className="panel-header">
          <div>
            <span className="eyebrow">
              {selectedEdge.kind === "line" ? "Componente de red" : "Conexión gráfica"}
            </span>
            <h2>{selectedEdge.kind === "line" ? "Línea eléctrica" : "Path visual"}</h2>
          </div>
          <span className="type-chip">
            {selectedEdge.kind === "line" ? "LINE" : "PATH"}
          </span>
        </div>

        <section className="property-section">
          <h3>Extremos</h3>
          <div className="endpoint-card">
            <span>Origen</span>
            <strong>{source?.properties.name || source?.id || "—"}</strong>
            <code>puerto {selectedEdge.source.portId}</code>
          </div>
          <div className="endpoint-card">
            <span>Destino</span>
            <strong>{target?.properties.name || target?.id || "—"}</strong>
            <code>puerto {selectedEdge.target.portId}</code>
          </div>
        </section>

        <section className="property-section">
          <PropertyRows
            document={document}
            entries={[
              ["Trazado", selectedEdge.routing],
              ["Nivel", voltage?.label || "Sin definir"],
              ...Object.entries(selectedEdge.properties),
            ]}
          />
        </section>

        <section className="property-section property-section--muted">
          <h3>Modo de lectura</h3>
          <p>La geometría y los parámetros de esta conexión están bloqueados.</p>
        </section>
      </aside>
    );
  }

  return (
    <aside className="properties-panel properties-panel--empty properties-panel--readonly">
      <div className="empty-panel-icon">⌁</div>
      <h2>Inspector de lectura</h2>
      <p>Selecciona un componente o una línea para revisar sus propiedades sin modificar el diagrama.</p>
      <div className="help-list">
        <span><kbd>V</kbd> Seleccionar</span>
        <span><kbd>H</kbd> Mover vista</span>
        <span><kbd>Rueda</kbd> Zoom</span>
      </div>
    </aside>
  );
}
