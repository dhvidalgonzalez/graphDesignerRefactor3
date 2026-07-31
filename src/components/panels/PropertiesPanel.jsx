import FieldInput from "../common/FieldInput.jsx";
import TerminalConnectionsEditor from "./TerminalConnectionsEditor.jsx";
import { getSymbolDefinition } from "../../domain/catalog/symbolCatalog.js";
import { getVoltageLevel, getVoltageLevels } from "../../domain/electrical/voltageLevels.js";
import { shallowEqual, useEditorActions, useEditorSelector } from "../../editor/EditorContext.jsx";

export default function PropertiesPanel() {
  const data = useEditorSelector((state) => ({
    document: state.document,
    selection: state.selection,
    tool: state.tool,
  }), shallowEqual);
  const actions = useEditorActions();
  const voltageLevels = getVoltageLevels(data.document.metadata);
  const selectedNodes = data.selection.nodeIds.map((id) => data.document.nodes[id]).filter(Boolean);
  const selectedEdge = data.selection.edgeId ? data.document.edges[data.selection.edgeId] : null;

  if (selectedNodes.length === 1) {
    const node = selectedNodes[0];
    const definition = getSymbolDefinition(node.type);
    return (
      <aside className="properties-panel">
        <div className="panel-header">
          <div><span className="eyebrow">Componente gráfico</span><h2>{definition.displayName}</h2></div>
          <span className="type-chip">{definition.shortLabel}</span>
        </div>

        <section className="property-section">
          <h3>Representación</h3>
          <div className="read-only-grid">
            <span>X</span><strong>{node.position.x.toFixed(2)}</strong>
            <span>Y</span><strong>{node.position.y.toFixed(2)}</strong>
            <span>Rotación</span><strong>{node.rotation ?? 0}°</strong>
          </div>
          <div className="inline-actions">
            <button onClick={() => actions.rotateSelection(-45)}>↶ 45°</button>
            <button onClick={() => actions.rotateSelection(45)}>↷ 45°</button>
          </div>
        </section>

        <section className="property-section">
          <h3>Propiedades de diagrama</h3>
          {definition.fields.map((field) => (
            <label className="property-field" key={`${node.id}-${field.key}`}>
              <span>{field.label}</span>
              <FieldInput
                field={field}
                value={node.properties[field.key]}
                voltageLevels={voltageLevels}
                onManageVoltage={actions.openVoltageLevels}
                onCreateVoltage={(value) => actions.createAndSetNodeVoltage(node.id, field.key, value)}
                onCommit={(value) => {
                  if (field.type === "voltage") actions.setNodeVoltage(node.id, field.key, value);
                  else actions.updateNodeProperties(node.id, { [field.key]: value });
                }}
              />
            </label>
          ))}
        </section>

        {definition.electrical !== false && (
          <TerminalConnectionsEditor
            document={data.document}
            entityKind="node"
            entityId={node.id}
          />
        )}

        {definition.electrical !== false && (
          <section className="property-section property-section--electric">
            <div className="section-heading-row"><div><span className="eyebrow">Modelo de red</span><h3>Ficha eléctrica</h3></div><span>⚡</span></div>
            <p>Potencias, impedancias, fabricante, regulación y demás datos técnicos se editan en una ficha separada.</p>
            <button className="button button--primary button--full" onClick={() => actions.openElectricalEditor("node", node.id)}>Abrir propiedades eléctricas</button>
          </section>
        )}

        <section className="property-section property-section--muted">
          <h3>Identidad lógica</h3><code>{node.id}</code>
          <p>Las conexiones referencian este componente y un puerto estable; sus coordenadas absolutas se calculan al renderizar.</p>
        </section>
      </aside>
    );
  }

  if (selectedNodes.length > 1) {
    return (
      <aside className="properties-panel">
        <div className="panel-header"><div><span className="eyebrow">Selección múltiple</span><h2>{selectedNodes.length} componentes</h2></div></div>
        <section className="property-section">
          <p>Los componentes se pueden mover, rotar y eliminar como conjunto. La propagación eléctrica sigue operando por cada isla conectada.</p>
          <div className="stacked-actions">
            <button onClick={() => actions.rotateSelection(-45)}>Rotar −45°</button>
            <button onClick={() => actions.rotateSelection(45)}>Rotar +45°</button>
            <button className="danger" onClick={actions.deleteSelection}>Eliminar selección</button>
          </div>
        </section>
      </aside>
    );
  }

  if (selectedEdge) {
    const source = data.document.nodes[selectedEdge.source.nodeId];
    const target = data.document.nodes[selectedEdge.target.nodeId];
    const isLine = selectedEdge.kind === "line";
    const voltage = getVoltageLevel(data.document.metadata, selectedEdge.properties.voltageLevelId);
    return (
      <aside className="properties-panel">
        <div className="panel-header">
          <div><span className="eyebrow">{isLine ? "Componente de red" : "Conexión gráfica"}</span><h2>{isLine ? "Línea eléctrica" : "Path visual"}</h2></div>
          <span className="type-chip">{isLine ? "LINE" : "PATH"}</span>
        </div>

        <section className="property-section">
          <h3>Extremos</h3>
          <div className="endpoint-card"><span>Origen</span><strong>{source?.properties.name || source?.id}</strong><code>puerto {selectedEdge.source.portId}</code></div>
          <div className="endpoint-card"><span>Destino</span><strong>{target?.properties.name || target?.id}</strong><code>puerto {selectedEdge.target.portId}</code></div>
        </section>

        <section className="property-section">
          <label className="property-field">
            <span>Modo de trazado</span>
            <select value={selectedEdge.routing} onChange={(event) => actions.setEdgeRouting(selectedEdge.id, event.target.value)}>
              <option value="orthogonal">Ortogonal</option>
              <option value="free">Libre</option>
            </select>
          </label>
          <div className="read-only-grid">
            <span>Vértices editables</span><strong>{selectedEdge.vertices.length}</strong>
            <span>Nivel propagado</span><strong>{voltage?.label ?? "Sin definir"}</strong>
          </div>
          <div className="stacked-actions">
            <button onClick={actions.addEdgeVertex}>Agregar vértice libre</button>
            <button disabled={data.selection.vertexIndex === null} onClick={actions.deleteEdgeVertex}>Eliminar vértice seleccionado</button>
          </div>
        </section>

        {isLine && (
          <TerminalConnectionsEditor
            document={data.document}
            entityKind="edge"
            entityId={selectedEdge.id}
          />
        )}

        {isLine ? (
          <section className="property-section property-section--electric">
            <div className="section-heading-row"><div><span className="eyebrow">Activo físico</span><h3>{selectedEdge.properties.name || "Línea eléctrica"}</h3></div><span>⚡</span></div>
            <div className="read-only-grid"><span>Longitud</span><strong>{selectedEdge.properties.lengthKm ?? 0} km</strong><span>Circuitos</span><strong>{selectedEdge.properties.circuitCount ?? 1}</strong></div>
            <button className="button button--primary button--full" onClick={() => actions.openElectricalEditor("edge", selectedEdge.id)}>Abrir propiedades eléctricas</button>
          </section>
        ) : (
          <section className="property-section property-section--muted">
            <h3>Propósito visual</h3>
            <p>Este path expresa continuidad y organiza el esquema, pero no representa por sí solo un tramo físico con kilómetros o impedancia.</p>
          </section>
        )}

        <section className="property-section"><button className="button danger-outline button--full" onClick={actions.deleteSelection}>Eliminar {isLine ? "línea" : "path"}</button></section>
      </aside>
    );
  }

  return (
    <aside className="properties-panel properties-panel--empty">
      <div className="empty-panel-icon">{data.tool === "electrical" ? "⚡" : "⌁"}</div>
      <h2>{data.tool === "electrical" ? "Modo eléctrico activo" : "Editor listo"}</h2>
      <p>{data.tool === "electrical" ? "Haz clic sobre un equipo o una línea real para abrir su ficha eléctrica." : "Selecciona un componente o un trazado para editar sus propiedades."}</p>
      <div className="help-list">
        <span><kbd>V</kbd> Seleccionar</span>
        <span><kbd>P</kbd> Path visual</span>
        <span><kbd>L</kbd> Línea eléctrica</span>
        <span><kbd>E</kbd> Modo eléctrico</span>
        <span><kbd>H</kbd> Mover vista</span>
      </div>
    </aside>
  );
}
