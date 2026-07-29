import { useEffect, useMemo, useRef, useState } from "react";
import { Layer, Rect, Stage } from "react-konva";
import {
  shallowEqual,
  useEditorActions,
  useEditorSelector,
  useEditorStore,
} from "../../editor/EditorContext.jsx";
import { useDiagramExport } from "../../editor/DiagramExportContext.jsx";
import { pointInRect } from "../../domain/geometry/point.js";
import { screenToWorld } from "../../domain/geometry/viewport.js";
import GridLayer from "./GridLayer.jsx";
import NodeView from "./NodeView.jsx";
import EdgeView from "./EdgeView.jsx";
import ConnectionPreview from "./ConnectionPreview.jsx";
import AnalysisOverlayLayer from "./AnalysisOverlayLayer.jsx";

const DRAW_TOOLS = new Set(["path", "line"]);

function normalizeRect(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo preparar la imagen exportada."));
    image.src = dataUrl;
    if (image.complete && image.naturalWidth > 0) resolve(image);
  });
}

async function flattenOnWhite(dataUrl, width, height, mimeType, quality) {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(mimeType, quality);
}

export default function DiagramCanvas() {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const contentLayerRef = useRef(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [selection, setSelection] = useState(null);
  const [panSession, setPanSession] = useState(null);
  const data = useEditorSelector(
    (state) => ({
      document: state.document,
      viewport: state.viewport,
      tool: state.tool,
      draft: state.connectionDraft,
      analysisOverlay: state.ui.analysisOverlay,
    }),
    shallowEqual,
  );
  const nodeIds = useMemo(() => Object.keys(data.document.nodes), [data.document.nodes]);
  const edgeIds = useMemo(() => Object.keys(data.document.edges), [data.document.edges]);
  const actions = useEditorActions();
  const store = useEditorStore();
  const { registerExporter } = useDiagramExport();

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const observer = new ResizeObserver(([entry]) => setSize({
      width: Math.max(320, entry.contentRect.width),
      height: Math.max(280, entry.contentRect.height),
    }));
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => registerExporter(async ({
    area = "content",
    pixelRatio = 2,
    includeGrid = false,
    mimeType = "image/png",
    quality = 0.94,
  } = {}) => {
    const stage = stageRef.current;
    const layer = contentLayerRef.current;
    if (!stage || !layer) throw new Error("El canvas todavía no está disponible.");

    const previous = store.getState();
    const visualSnapshot = {
      selection: previous.selection,
      tool: previous.tool,
      connectionDraft: previous.connectionDraft,
      showPorts: previous.settings.showPorts,
      gridVisible: previous.settings.gridVisible,
    };

    store.setState((state) => ({
      ...state,
      selection: { nodeIds: [], edgeId: null, vertexIndex: null },
      tool: "select",
      connectionDraft: null,
      settings: {
        ...state.settings,
        showPorts: false,
        gridVisible: area === "viewport" && includeGrid,
      },
    }));

    try {
      await nextPaint();
      let crop = { x: 0, y: 0, width: size.width, height: size.height };
      if (area === "content") {
        const bounds = layer.getClientRect({ relativeTo: stage });
        if (Number.isFinite(bounds.width) && bounds.width > 1 && Number.isFinite(bounds.height) && bounds.height > 1) {
          const padding = 28;
          crop = {
            x: bounds.x - padding,
            y: bounds.y - padding,
            width: bounds.width + padding * 2,
            height: bounds.height + padding * 2,
          };
        }
      }

      const ratio = Math.max(1, Math.min(4, Number(pixelRatio) || 1));
      const rawDataUrl = stage.toDataURL({
        x: crop.x,
        y: crop.y,
        width: crop.width,
        height: crop.height,
        pixelRatio: ratio,
        mimeType,
        quality,
      });
      const outputWidth = Math.max(1, Math.round(crop.width * ratio));
      const outputHeight = Math.max(1, Math.round(crop.height * ratio));
      return {
        dataUrl: await flattenOnWhite(
          rawDataUrl,
          outputWidth,
          outputHeight,
          mimeType,
          quality,
        ),
        width: outputWidth,
        height: outputHeight,
      };
    } finally {
      store.setState((state) => ({
        ...state,
        selection: visualSnapshot.selection,
        tool: visualSnapshot.tool,
        connectionDraft: visualSnapshot.connectionDraft,
        settings: {
          ...state.settings,
          showPorts: visualSnapshot.showPorts,
          gridVisible: visualSnapshot.gridVisible,
        },
      }));
    }
  }), [registerExporter, size.height, size.width, store]);

  const cursor = useMemo(() => {
    if (panSession) return "grabbing";
    if (data.tool === "pan") return "grab";
    if (DRAW_TOOLS.has(data.tool)) return "crosshair";
    if (data.tool === "electrical") return "pointer";
    return "default";
  }, [data.tool, panSession]);

  const pointerScreen = () => stageRef.current?.getPointerPosition() ?? { x: 0, y: 0 };
  const pointerWorld = () => screenToWorld(pointerScreen(), data.viewport);

  const onMouseDown = (event) => {
    const isStage = event.target === event.target.getStage();
    const mouseButton = event.evt.button;
    if (data.tool === "pan" || mouseButton === 1) {
      setPanSession(pointerScreen());
      return;
    }
    if (!isStage) return;
    const world = pointerWorld();
    if (DRAW_TOOLS.has(data.tool) && data.draft) {
      actions.addConnectionVertex(world);
      return;
    }
    if (data.tool === "select") {
      const additive = event.evt.shiftKey || event.evt.ctrlKey || event.evt.metaKey;
      if (!additive) actions.clearSelection();
      setSelection({ start: world, current: world, additive });
    }
  };

  const onMouseMove = () => {
    const screen = pointerScreen();
    if (panSession) {
      actions.panViewport({ x: screen.x - panSession.x, y: screen.y - panSession.y });
      setPanSession(screen);
      return;
    }
    const world = screenToWorld(screen, data.viewport);
    if (selection) setSelection((current) => ({ ...current, current: world }));
    if (DRAW_TOOLS.has(data.tool) && data.draft) actions.updateConnectionPointer(world);
  };

  const onMouseUp = () => {
    if (panSession) {
      setPanSession(null);
      return;
    }
    if (!selection) return;
    const rect = normalizeRect(selection.start, selection.current);
    if (rect.width > 0.5 || rect.height > 0.5) {
      const selectedIds = nodeIds.filter((id) => pointInRect(data.document.nodes[id].position, rect));
      actions.selectNodes(selectedIds, selection.additive ? "add" : "replace");
    }
    setSelection(null);
  };

  const selectionRect = selection ? normalizeRect(selection.start, selection.current) : null;

  return (
    <div className="canvas-container" ref={containerRef} style={{ cursor }}>
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { setPanSession(null); setSelection(null); }}
        onWheel={(event) => {
          event.evt.preventDefault();
          actions.zoomAt(pointerScreen(), event.evt.deltaY < 0 ? 1.12 : 1 / 1.12);
        }}
      >
        <Layer ref={contentLayerRef} x={data.viewport.x} y={data.viewport.y} scaleX={data.viewport.scale} scaleY={data.viewport.scale}>
          <GridLayer width={size.width} height={size.height} />
          {edgeIds.map((edgeId) => <EdgeView key={edgeId} edgeId={edgeId} />)}
          {nodeIds.map((nodeId) => <NodeView key={nodeId} nodeId={nodeId} />)}
          <ConnectionPreview />
          <AnalysisOverlayLayer />
          {selectionRect && (
            <Rect
              x={selectionRect.x}
              y={selectionRect.y}
              width={selectionRect.width}
              height={selectionRect.height}
              fill="rgba(37, 99, 235, 0.10)"
              stroke="#2563eb"
              strokeWidth={0.8 / data.viewport.scale}
              dash={[2, 1.5]}
              listening={false}
            />
          )}
        </Layer>
      </Stage>
      {data.analysisOverlay?.result && (
        <div className="analysis-canvas-badge">
          <div>
            <span>Estudio activo</span>
            <strong>{data.analysisOverlay.study?.name || "Flujo de carga"}</strong>
            <small>{data.analysisOverlay.result.operatingCaseId || data.analysisOverlay.study?.operatingCaseId || "Caso de operación"}</small>
          </div>
          <button
            type="button"
            onClick={() => actions.updateAnalysisOverlayOptions({ visible: !data.analysisOverlay.options?.visible })}
          >
            {data.analysisOverlay.options?.visible ? "Ocultar" : "Mostrar"}
          </button>
          <button type="button" className="danger" onClick={actions.clearActiveAnalysisResult}>×</button>
        </div>
      )}
    </div>
  );
}
