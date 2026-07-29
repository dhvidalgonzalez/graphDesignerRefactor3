import {
  shallowEqual,
  useEditorActions,
  useEditorSelector,
} from "../../editor/EditorContext.jsx";
import { useWorkspace } from "../../workspace/WorkspaceContext.jsx";
import SymbolPicker from "./SymbolPicker.jsx";
import VoltageProjectControl from "./VoltageProjectControl.jsx";

const ToolButton = ({
  active = false,
  disabled = false,
  title,
  children,
  onClick,
  compact = false,
}) => (
  <button
    className={`tool-button ${active ? "tool-button--active" : ""} ${compact ? "tool-button--compact" : ""}`}
    disabled={disabled}
    title={title}
    onClick={onClick}
  >
    {children}
  </button>
);

export default function ToolBar() {
  const data = useEditorSelector(
    (state) => ({
      tool: state.tool,
      selection: state.selection,
      settings: state.settings,
      viewport: state.viewport,
      connecting: Boolean(state.connectionDraft),
    }),
    shallowEqual,
  );
  const actions = useEditorActions();
  const { activeProject } = useWorkspace();
  const canEdit = activeProject?.canEdit ?? false;
  const hasNodes = data.selection.nodeIds.length > 0;
  const hasSelection = hasNodes || Boolean(data.selection.edgeId);

  if (!canEdit) {
    return (
      <div className="tool-bar tool-bar--viewer">
        <div className="tool-group tool-group--primary">
          <span className="viewer-toolbar-label">Vista de lectura</span>
          <div className="tool-separator" />
          <ToolButton
            active={data.tool === "select"}
            title="Seleccionar e inspeccionar"
            onClick={() => actions.setTool("select")}
          >
            ↖ <span>Seleccionar</span>
          </ToolButton>
          <ToolButton
            active={data.tool === "pan"}
            title="Desplazar vista"
            onClick={() => actions.setTool("pan")}
          >
            ✥ <span>Mover vista</span>
          </ToolButton>
        </div>

        <div className="tool-group tool-group--right">
          <ToolButton
            compact
            title="Alejar"
            onClick={() =>
              actions.zoomAt(
                { x: window.innerWidth / 2, y: window.innerHeight / 2 },
                1 / 1.15,
              )
            }
          >
            −
          </ToolButton>
          <span className="zoom-indicator">
            {Math.round(data.viewport.scale * 25)}%
          </span>
          <ToolButton
            compact
            title="Acercar"
            onClick={() =>
              actions.zoomAt(
                { x: window.innerWidth / 2, y: window.innerHeight / 2 },
                1.15,
              )
            }
          >
            ＋
          </ToolButton>
          <ToolButton
            compact
            title="Restablecer vista"
            onClick={actions.resetViewport}
          >
            ⌂
          </ToolButton>
          <ToolButton
            compact
            active={data.settings.gridVisible}
            title="Mostrar u ocultar cuadrícula"
            onClick={() => actions.toggleSetting("gridVisible")}
          >
            #
          </ToolButton>
        </div>
      </div>
    );
  }

  return (
    <div className="tool-bar">
      <div className="tool-group tool-group--primary">
        <SymbolPicker />
        <div className="tool-separator" />
        <ToolButton
          active={data.tool === "select"}
          title="Seleccionar y mover (V)"
          onClick={() => actions.setTool("select")}
        >
          ↖ <span>Seleccionar</span>
        </ToolButton>
        <ToolButton
          active={data.tool === "path"}
          title="Dibujar path visual (P)"
          onClick={() => actions.setTool("path")}
        >
          ⌁ <span>Path</span>
        </ToolButton>
        <ToolButton
          active={data.tool === "line"}
          title="Dibujar línea eléctrica real (L)"
          onClick={() => actions.setTool("line")}
        >
          ╱ <span>Línea</span>
        </ToolButton>
        <ToolButton
          active={data.tool === "electrical"}
          title="Abrir propiedades eléctricas (E)"
          onClick={() => actions.setTool("electrical")}
        >
          ⚡ <span>Modo eléctrico</span>
        </ToolButton>
        <ToolButton
          active={data.tool === "pan"}
          title="Desplazar vista (H)"
          onClick={() => actions.setTool("pan")}
        >
          ✥
        </ToolButton>
        {data.connecting && (
          <ToolButton
            title="Cancelar trazado (Esc)"
            onClick={actions.cancelConnection}
          >
            × Cancelar
          </ToolButton>
        )}
      </div>

      <div className="tool-group routing-control" aria-label="Modo de trazado">
        <span className="tool-group-label">Trazado</span>
        <div className="segmented-control">
          <button
            className={data.settings.routingMode === "orthogonal" ? "active" : ""}
            onClick={() => actions.setRoutingMode("orthogonal")}
            title="Segmentos horizontales y verticales"
          >
            Ortogonal
          </button>
          <button
            className={data.settings.routingMode === "free" ? "active" : ""}
            onClick={() => actions.setRoutingMode("free")}
            title="Polilínea con ángulos libres"
          >
            Libre
          </button>
        </div>
      </div>

      <VoltageProjectControl />

      <div className="tool-group tool-group--right">
        <ToolButton
          compact
          disabled={!hasNodes}
          title="Rotar −45°"
          onClick={() => actions.rotateSelection(-45)}
        >
          ↶
        </ToolButton>
        <ToolButton
          compact
          disabled={!hasNodes}
          title="Rotar +45° (R)"
          onClick={() => actions.rotateSelection(45)}
        >
          ↷
        </ToolButton>
        <ToolButton
          compact
          disabled={!hasSelection}
          title="Eliminar selección"
          onClick={actions.deleteSelection}
        >
          ⌫
        </ToolButton>
        <div className="tool-separator" />
        <ToolButton
          compact
          title="Alejar"
          onClick={() =>
            actions.zoomAt(
              { x: window.innerWidth / 2, y: window.innerHeight / 2 },
              1 / 1.15,
            )
          }
        >
          −
        </ToolButton>
        <span className="zoom-indicator">
          {Math.round(data.viewport.scale * 25)}%
        </span>
        <ToolButton
          compact
          title="Acercar"
          onClick={() =>
            actions.zoomAt(
              { x: window.innerWidth / 2, y: window.innerHeight / 2 },
              1.15,
            )
          }
        >
          ＋
        </ToolButton>
        <ToolButton
          compact
          active={data.settings.gridVisible}
          title="Cuadrícula"
          onClick={() => actions.toggleSetting("gridVisible")}
        >
          #
        </ToolButton>
        <ToolButton
          compact
          active={data.settings.snapToGrid}
          title="Ajuste a cuadrícula"
          onClick={() => actions.toggleSetting("snapToGrid")}
        >
          ⊞
        </ToolButton>
      </div>
    </div>
  );
}
