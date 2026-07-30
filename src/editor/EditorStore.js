import { applyDefaultNodeVoltageLevels, createEdge, createNode } from "../domain/diagram/createDiagram.js";
import {
  getNodePorts,
  getPortWorldPosition,
  getSymbolDefinition,
} from "../domain/catalog/symbolCatalog.js";
import { cloneDiagram } from "../domain/diagram/serialization.js";
import { getEdgePoints } from "../domain/diagram/edgeGeometry.js";
import { snapPoint } from "../domain/geometry/snap.js";
import { orthogonalizeWaypoint } from "../domain/geometry/routing.js";
import { zoomViewportAt } from "../domain/geometry/viewport.js";
import {
  ensureVoltageLevel,
  getVoltageLevel,
  removeVoltageLevel,
  updateVoltageLevel,
} from "../domain/electrical/voltageLevels.js";
import { assignVoltageToIsland, propagateConnectionVoltage } from "../domain/electrical/topology.js";
import { createId } from "../utils/id.js";
import { synchronizeElectricalModel } from "../domain/electrical/electricalModel.js";
import { markParameterAsUserValue, patchParameterMetadata } from "../domain/electrical/parameterValue.js";
import { createOperatingCase, normalizeOperatingCases } from "../domain/analysis/operatingCases.js";
import { normalizeAnalysisConfiguration } from "../domain/analysis/analysisConfiguration.js";
import {
  DEFAULT_ANALYSIS_OVERLAY_OPTIONS,
  defaultAnalysisResultViewId,
  normalizeAnalysisResult,
} from "../domain/analysis/analysisResults.js";
import { saveAnalysisResultLayoutService } from "../services/analysis/index.js";
import {
  clearAnalysisLabelLayout,
  loadAnalysisLabelLayout,
  parseAnalysisLabelLayoutJson,
  saveAnalysisLabelLayout,
} from "../infrastructure/analysis/localAnalysisLayoutRepository.js";

const HISTORY_LIMIT = 100;
const DRAW_TOOLS = new Set(["path", "line"]);

export function createInitialEditorState(document) {
  return {
    document,
    selection: { nodeIds: [], edgeId: null, vertexIndex: null },
    tool: "select",
    connectionDraft: null,
    viewport: { x: 80, y: 70, scale: 4 },
    settings: {
      gridSize: 2.5,
      gridVisible: true,
      snapToGrid: true,
      showPorts: true,
      routingMode: "orthogonal",
    },
    persistence: { status: "saved", message: "Guardado local" },
    ui: {
      voltageLevelsOpen: false,
      electricalEditor: null,
      rightPanelMode: "properties",
      analysisOverlay: {
        study: null,
        result: null,
        viewId: null,
        labelOffsets: {},
        options: { ...DEFAULT_ANALYSIS_OVERLAY_OPTIONS },
      },
      notice: null,
    },
  };
}

function documentsDiffer(a, b) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function firstPortId(node) {
  return getNodePorts(node)[0]?.id ?? null;
}


function nextNodeName(document, type) {
  const definition = getSymbolDefinition(type);
  const base = String(definition.defaultProperties?.name || definition.displayName || "Componente").trim();
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(`^${escaped}(?:\\s+(\\d+))?$`, "i");
  let max = 0;

  Object.values(document.nodes).forEach((node) => {
    if (node.type !== type) return;
    const name = String(node.properties?.name || "").trim();
    const match = name.match(matcher);
    if (!match) return;
    max = Math.max(max, match[1] ? Number(match[1]) : 1);
  });

  return `${base} ${max + 1}`;
}

function portForVoltageProperty(node, propertyKey) {
  const definition = getSymbolDefinition(node.type);
  if (!definition.voltagePropertiesByPort) return firstPortId(node);
  return Object.entries(definition.voltagePropertiesByPort).find(([, key]) => key === propertyKey)?.[0] ?? null;
}

export class EditorStore {
  constructor(document, { readOnly = false } = {}) {
    this.readOnly = readOnly;
    this.state = createInitialEditorState(document);
    this.listeners = new Set();
    this.past = [];
    this.future = [];
    this.actions = this.createActions();
  }

  getState = () => this.state;

  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  emit() {
    this.listeners.forEach((listener) => listener());
  }

  setState(updater) {
    const next = typeof updater === "function" ? updater(this.state) : updater;
    if (next === this.state) return;
    this.state = next;
    this.emit();
  }

  setNotice(message, tone = "info") {
    this.setState((state) => ({ ...state, ui: { ...state.ui, notice: message ? { message, tone } : null } }));
  }

  commitDocument(nextDocument, { history = true } = {}) {
    if (this.readOnly) {
      this.setNotice("Este proyecto está disponible sólo para lectura.", "info");
      return;
    }
    const previous = this.state.document;
    synchronizeElectricalModel(nextDocument);
    if (!documentsDiffer(previous, nextDocument)) return;
    if (history) {
      this.past = [...this.past.slice(-(HISTORY_LIMIT - 1)), cloneDiagram(previous)];
      this.future = [];
    }
    this.setState((state) => ({
      ...state,
      document: { ...nextDocument, updatedAt: new Date().toISOString() },
      persistence: { status: "dirty", message: "Cambios pendientes" },
    }));
  }

  mutateDocument(mutator, options) {
    const next = cloneDiagram(this.state.document);
    mutator(next);
    this.commitDocument(next, options);
  }

  createActions() {
    return {
      loadDocument: (document) => {
        if (this.readOnly) {
          this.setNotice("No puedes importar cambios en un proyecto de sólo lectura.", "info");
          return;
        }
        this.past = [];
        this.future = [];
        this.setState({ ...createInitialEditorState(document), viewport: this.state.viewport });
      },

      setPersistence: (status, message) => {
        this.setState((state) => ({ ...state, persistence: { status, message } }));
      },

      setTool: (tool) => {
        if (this.readOnly && tool !== "select" && tool !== "pan") {
          this.setNotice("En modo de lectura sólo puedes seleccionar e inspeccionar o mover la vista.", "info");
          return;
        }
        this.setState((state) => ({
          ...state,
          tool,
          connectionDraft: DRAW_TOOLS.has(tool) && state.connectionDraft?.kind === tool ? state.connectionDraft : null,
          selection: DRAW_TOOLS.has(tool)
            ? { nodeIds: [], edgeId: null, vertexIndex: null }
            : state.selection,
        }));
      },

      setRoutingMode: (routingMode) => {
        this.setState((state) => ({
          ...state,
          settings: { ...state.settings, routingMode },
          connectionDraft: state.connectionDraft ? { ...state.connectionDraft, routing: routingMode, vertices: [] } : null,
        }));
      },

      addNode: (type, position) => {
        const snapped = snapPoint(position, this.state.settings.gridSize, this.state.settings.snapToGrid);
        const next = cloneDiagram(this.state.document);
        const node = createNode(type, snapped, {
          properties: { name: nextNodeName(next, type) },
        });
        applyDefaultNodeVoltageLevels(next, node);
        next.nodes[node.id] = node;
        this.commitDocument(next);
        this.setState((state) => ({
          ...state,
          selection: { nodeIds: [node.id], edgeId: null, vertexIndex: null },
          tool: "select",
        }));
        return node.id;
      },

      selectNode: (nodeId, mode = "replace") => {
        this.setState((state) => {
          const current = state.selection.nodeIds;
          let nodeIds;
          if (mode === "toggle") nodeIds = current.includes(nodeId) ? current.filter((id) => id !== nodeId) : [...current, nodeId];
          else if (mode === "add") nodeIds = current.includes(nodeId) ? current : [...current, nodeId];
          else nodeIds = [nodeId];
          return { ...state, selection: { nodeIds, edgeId: null, vertexIndex: null }, ui: { ...state.ui, rightPanelMode: "properties" } };
        });
      },

      selectNodes: (nodeIds, mode = "replace") => {
        this.setState((state) => ({
          ...state,
          selection: {
            nodeIds: mode === "add" ? [...new Set([...state.selection.nodeIds, ...nodeIds])] : nodeIds,
            edgeId: null,
            vertexIndex: null,
          },
          ui: { ...state.ui, rightPanelMode: "properties" },
        }));
      },

      selectEdge: (edgeId) => {
        this.setState((state) => ({ ...state, selection: { nodeIds: [], edgeId, vertexIndex: null }, ui: { ...state.ui, rightPanelMode: "properties" } }));
      },

      selectVertex: (edgeId, vertexIndex) => {
        this.setState((state) => ({ ...state, selection: { nodeIds: [], edgeId, vertexIndex } }));
      },

      clearSelection: () => {
        this.setState((state) => ({ ...state, selection: { nodeIds: [], edgeId: null, vertexIndex: null } }));
      },

      moveNodeTo: (nodeId, position) => {
        const node = this.state.document.nodes[nodeId];
        if (!node) return;
        const target = snapPoint(position, this.state.settings.gridSize, this.state.settings.snapToGrid);
        const delta = { x: target.x - node.position.x, y: target.y - node.position.y };
        const selected = this.state.selection.nodeIds.includes(nodeId) ? this.state.selection.nodeIds : [nodeId];
        this.mutateDocument((document) => {
          selected.forEach((id) => {
            const current = document.nodes[id];
            if (!current) return;
            current.position = snapPoint(
              { x: current.position.x + delta.x, y: current.position.y + delta.y },
              this.state.settings.gridSize,
              this.state.settings.snapToGrid,
            );
          });
        });
      },

      rotateSelection: (deltaDegrees) => {
        const selected = this.state.selection.nodeIds;
        if (!selected.length) return;
        this.mutateDocument((document) => {
          selected.forEach((id) => {
            const node = document.nodes[id];
            if (node) node.rotation = ((node.rotation ?? 0) + deltaDegrees + 360) % 360;
          });
        });
      },

      updateNodeProperties: (nodeId, patch) => {
        this.mutateDocument((document) => {
          const node = document.nodes[nodeId];
          if (node) node.properties = { ...node.properties, ...patch };
        });
      },

      setNodeVoltage: (nodeId, propertyKey, levelId) => {
        if (!getVoltageLevel(this.state.document.metadata, levelId)) return;
        this.mutateDocument((document) => {
          const node = document.nodes[nodeId];
          if (!node) return;
          node.properties[propertyKey] = levelId;
          const portId = portForVoltageProperty(node, propertyKey);
          if (portId) assignVoltageToIsland(document, { nodeId, portId }, levelId);
          node.properties[propertyKey] = levelId;
          markParameterAsUserValue(node, propertyKey, levelId);
        });
        this.setNotice("Nivel de voltaje propagado hasta el siguiente transformador.", "success");
      },

      createAndSetNodeVoltage: (nodeId, propertyKey, value) => {
        try {
          const next = cloneDiagram(this.state.document);
          const level = ensureVoltageLevel(next, { value, color: "#0f766e" });
          const node = next.nodes[nodeId];
          if (!node) return null;
          node.properties[propertyKey] = level.id;
          const portId = portForVoltageProperty(node, propertyKey);
          if (portId) assignVoltageToIsland(next, { nodeId, portId }, level.id);
          node.properties[propertyKey] = level.id;
          markParameterAsUserValue(node, propertyKey, level.id);
          this.commitDocument(next);
          this.setNotice(`Nivel ${level.label} creado y propagado.`, "success");
          return level.id;
        } catch (error) {
          this.setNotice(error instanceof Error ? error.message : String(error), "error");
          return null;
        }
      },

      updateNodeElectricalParameter: (nodeId, key, value) => {
        this.mutateDocument((document) => {
          const node = document.nodes[nodeId];
          if (!node) return;
          node.properties = { ...node.properties, [key]: value };
          markParameterAsUserValue(node, key, value);
        });
      },

      updateEdgeElectricalParameter: (edgeId, key, value) => {
        this.mutateDocument((document) => {
          const edge = document.edges[edgeId];
          if (!edge) return;
          edge.properties = { ...edge.properties, [key]: value };
          markParameterAsUserValue(edge, key, value);
        });
      },

      updateElectricalParameterMetadata: (kind, id, key, patch) => {
        this.mutateDocument((document) => {
          const entity = kind === "node" ? document.nodes[id] : document.edges[id];
          if (entity) patchParameterMetadata(entity, key, patch);
        });
      },

      updateEdgeProperties: (edgeId, patch) => {
        this.mutateDocument((document) => {
          const edge = document.edges[edgeId];
          if (edge) edge.properties = { ...edge.properties, ...patch };
        });
      },

      setEdgeVoltage: (edgeId, levelId) => {
        if (!getVoltageLevel(this.state.document.metadata, levelId)) return;
        this.mutateDocument((document) => {
          const edge = document.edges[edgeId];
          if (!edge) return;
          assignVoltageToIsland(document, edge.source, levelId);
          edge.properties.voltageLevelId = levelId;
          markParameterAsUserValue(edge, "voltageLevelId", levelId);
        });
      },

      createAndSetEdgeVoltage: (edgeId, value) => {
        try {
          const next = cloneDiagram(this.state.document);
          const level = ensureVoltageLevel(next, { value, color: "#0f766e" });
          const edge = next.edges[edgeId];
          if (!edge) return null;
          assignVoltageToIsland(next, edge.source, level.id);
          edge.properties.voltageLevelId = level.id;
          markParameterAsUserValue(edge, "voltageLevelId", level.id);
          this.commitDocument(next);
          this.setNotice(`Nivel ${level.label} creado y propagado.`, "success");
          return level.id;
        } catch (error) {
          this.setNotice(error instanceof Error ? error.message : String(error), "error");
          return null;
        }
      },

      updateDocumentName: (name) => {
        this.mutateDocument((document) => { document.name = name; });
      },

      setActiveVoltageLevel: (levelId) => {
        if (!getVoltageLevel(this.state.document.metadata, levelId)) return;
        this.mutateDocument((document) => { document.metadata.activeVoltageLevelId = levelId; });
      },

      createVoltageLevel: (input) => {
        try {
          const next = cloneDiagram(this.state.document);
          const created = ensureVoltageLevel(next, input);
          this.commitDocument(next);
          this.setNotice(`Nivel ${created.label} disponible en el proyecto.`, "success");
          return created.id;
        } catch (error) {
          this.setNotice(error instanceof Error ? error.message : String(error), "error");
          return null;
        }
      },

      updateVoltageLevel: (levelId, patch) => {
        try {
          this.mutateDocument((document) => { updateVoltageLevel(document, levelId, patch); });
          this.setNotice("Nivel de voltaje actualizado.", "success");
          return true;
        } catch (error) {
          this.setNotice(error instanceof Error ? error.message : String(error), "error");
          return false;
        }
      },

      removeVoltageLevel: (levelId) => {
        const used = Object.values(this.state.document.nodes).some((node) =>
          Object.entries(node.properties).some(([key, value]) => key.startsWith("voltageLevelId") && value === levelId),
        ) || Object.values(this.state.document.edges).some((edge) => edge.properties.voltageLevelId === levelId);
        if (used) {
          this.setNotice("No se puede eliminar un nivel utilizado por componentes o líneas.", "error");
          return false;
        }
        try {
          this.mutateDocument((document) => removeVoltageLevel(document, levelId));
          this.setNotice("Nivel de voltaje eliminado.", "success");
          return true;
        } catch (error) {
          this.setNotice(error instanceof Error ? error.message : String(error), "error");
          return false;
        }
      },

      openVoltageLevels: () => {
        this.setState((state) => ({ ...state, ui: { ...state.ui, voltageLevelsOpen: true } }));
      },

      closeVoltageLevels: () => {
        this.setState((state) => ({ ...state, ui: { ...state.ui, voltageLevelsOpen: false } }));
      },

      openElectricalEditor: (kind, id) => {
        this.setState((state) => ({ ...state, ui: { ...state.ui, electricalEditor: { kind, id } } }));
      },

      closeElectricalEditor: () => {
        this.setState((state) => ({ ...state, ui: { ...state.ui, electricalEditor: null } }));
      },

      openAnalysisPanel: () => {
        this.setState((state) => ({ ...state, ui: { ...state.ui, rightPanelMode: "analysis" } }));
      },

      closeAnalysisPanel: () => {
        this.setState((state) => ({ ...state, ui: { ...state.ui, rightPanelMode: "properties" } }));
      },

      activateAnalysisResult: (study, result) => {
        const normalized = normalizeAnalysisResult(result);
        const studyId = study?.id || normalized.studyId;
        const diagramId = this.state.document.id || normalized.diagramId;
        this.setState((state) => ({
          ...state,
          ui: {
            ...state.ui,
            analysisOverlay: {
              study: study ? { ...study } : null,
              result: normalized,
              viewId: defaultAnalysisResultViewId(normalized),
              labelOffsets: {
                ...parseAnalysisLabelLayoutJson(study?.resultLayoutJson),
                ...loadAnalysisLabelLayout(diagramId, studyId),
              },
              options: {
                ...DEFAULT_ANALYSIS_OVERLAY_OPTIONS,
                ...(state.ui.analysisOverlay?.options ?? {}),
                visible: true,
              },
            },
          },
        }));
      },

      setAnalysisResultView: (viewId) => {
        this.setState((state) => ({
          ...state,
          ui: {
            ...state.ui,
            analysisOverlay: {
              ...(state.ui.analysisOverlay ?? {}),
              viewId,
            },
          },
        }));
      },

      moveAnalysisResultLabel: (labelId, offset) => {
        const overlay = this.state.ui.analysisOverlay;
        if (!overlay?.result || !labelId) return;
        const x = Number(offset?.x);
        const y = Number(offset?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const nextLayout = {
          ...(overlay.labelOffsets ?? {}),
          [labelId]: { x, y },
        };
        const studyId = overlay.study?.id || overlay.result.studyId;
        saveAnalysisLabelLayout(
          this.state.document.id || overlay.result.diagramId,
          studyId,
          nextLayout,
        );
        saveAnalysisResultLayoutService(studyId, nextLayout).catch(() => {});
        this.setState((state) => ({
          ...state,
          ui: {
            ...state.ui,
            analysisOverlay: {
              ...(state.ui.analysisOverlay ?? {}),
              labelOffsets: nextLayout,
            },
          },
        }));
      },

      resetAnalysisResultLabelLayout: () => {
        const overlay = this.state.ui.analysisOverlay;
        if (!overlay?.result) return;
        const studyId = overlay.study?.id || overlay.result.studyId;
        clearAnalysisLabelLayout(
          this.state.document.id || overlay.result.diagramId,
          studyId,
        );
        saveAnalysisResultLayoutService(studyId, {}).catch(() => {});
        this.setState((state) => ({
          ...state,
          ui: {
            ...state.ui,
            analysisOverlay: {
              ...(state.ui.analysisOverlay ?? {}),
              labelOffsets: {},
            },
          },
        }));
      },

      clearActiveAnalysisResult: () => {
        this.setState((state) => ({
          ...state,
          ui: {
            ...state.ui,
            analysisOverlay: {
              study: null,
              result: null,
              viewId: null,
              labelOffsets: {},
              options: { ...DEFAULT_ANALYSIS_OVERLAY_OPTIONS },
            },
          },
        }));
      },

      updateAnalysisOverlayOptions: (patch) => {
        this.setState((state) => ({
          ...state,
          ui: {
            ...state.ui,
            analysisOverlay: {
              ...(state.ui.analysisOverlay ?? {}),
              options: {
                ...DEFAULT_ANALYSIS_OVERLAY_OPTIONS,
                ...(state.ui.analysisOverlay?.options ?? {}),
                ...patch,
              },
            },
          },
        }));
      },

      addOperatingCase: (name) => {
        let createdId = null;
        this.mutateDocument((document) => {
          const created = createOperatingCase(name || `Caso ${normalizeOperatingCases(document.operatingCases).length + 1}`);
          createdId = created.id;
          document.operatingCases = normalizeOperatingCases([...document.operatingCases, created]);
        });
        return createdId;
      },

      updateOperatingCase: (caseId, patch) => {
        this.mutateDocument((document) => {
          document.operatingCases = normalizeOperatingCases(document.operatingCases).map((item) => (
            item.id === caseId ? { ...item, ...patch, id: item.id } : item
          ));
        });
      },

      setDefaultOperatingCase: (caseId) => {
        this.mutateDocument((document) => {
          document.operatingCases = normalizeOperatingCases(document.operatingCases).map((item) => ({
            ...item,
            isDefault: item.id === caseId,
          }));
        });
      },

      removeOperatingCase: (caseId) => {
        const cases = normalizeOperatingCases(this.state.document.operatingCases);
        if (cases.length <= 1) {
          this.setNotice("El diagrama debe conservar al menos un caso de operación.", "error");
          return false;
        }
        this.mutateDocument((document) => {
          document.operatingCases = normalizeOperatingCases(document.operatingCases.filter((item) => item.id !== caseId));
        });
        return true;
      },

      updateOperatingCaseOverride: (caseId, componentId, patch) => {
        this.mutateDocument((document) => {
          document.operatingCases = normalizeOperatingCases(document.operatingCases).map((item) => {
            if (item.id !== caseId) return item;
            const current = item.overrides?.[componentId] ?? {};
            const next = Object.fromEntries(Object.entries({ ...current, ...patch }).filter(([, value]) => value !== undefined && value !== ""));
            const overrides = { ...(item.overrides ?? {}) };
            if (Object.keys(next).length) overrides[componentId] = next;
            else delete overrides[componentId];
            return { ...item, overrides };
          });
        });
      },

      clearOperatingCaseOverride: (caseId, componentId) => {
        this.mutateDocument((document) => {
          document.operatingCases = normalizeOperatingCases(document.operatingCases).map((item) => {
            if (item.id !== caseId) return item;
            const overrides = { ...(item.overrides ?? {}) };
            delete overrides[componentId];
            return { ...item, overrides };
          });
        });
      },

      updateAnalysisConfiguration: (section, patch) => {
        this.mutateDocument((document) => {
          const current = normalizeAnalysisConfiguration(document.analysisConfiguration);
          document.analysisConfiguration = normalizeAnalysisConfiguration(
            section
              ? { ...current, [section]: { ...(current[section] ?? {}), ...patch } }
              : { ...current, ...patch },
          );
        });
      },

      clearNotice: () => this.setNotice(null),

      deleteSelection: () => {
        const { nodeIds, edgeId } = this.state.selection;
        if (!nodeIds.length && !edgeId) return;
        this.mutateDocument((document) => {
          if (edgeId) delete document.edges[edgeId];
          if (nodeIds.length) {
            nodeIds.forEach((id) => delete document.nodes[id]);
            Object.values(document.edges).forEach((edge) => {
              if (nodeIds.includes(edge.source.nodeId) || nodeIds.includes(edge.target.nodeId)) delete document.edges[edge.id];
            });
          }
        });
        this.actions.clearSelection();
      },

      connectDynamicPort: (nodeId, localPoint) => {
        const node = this.state.document.nodes[nodeId];
        if (!node || !DRAW_TOOLS.has(this.state.tool)) return;
        const definition = getSymbolDefinition(node.type);
        if (!definition.dynamicPort) return;
        const projected = definition.dynamicPort.project(node, snapPoint(localPoint, this.state.settings.gridSize, this.state.settings.snapToGrid));
        const existing = getNodePorts(node).find((port) => Math.hypot(port.x - projected.x, port.y - projected.y) <= definition.dynamicPort.reuseDistance);
        if (existing) {
          this.actions.completeConnection(nodeId, existing.id);
          return;
        }

        const port = { id: createId("port"), name: "Derivación", x: projected.x, y: projected.y };
        const next = cloneDiagram(this.state.document);
        next.nodes[nodeId].ports = [...(next.nodes[nodeId].ports ?? []), port];
        const draft = this.state.connectionDraft;
        if (!draft) {
          this.commitDocument(next);
          this.setState((state) => ({
            ...state,
            connectionDraft: {
              kind: state.tool,
              source: { nodeId, portId: port.id },
              vertices: [],
              pointer: null,
              routing: state.settings.routingMode,
            },
          }));
          return;
        }
        this.completeConnectionIntoDocument(next, nodeId, port.id);
      },

      startConnection: (nodeId, portId) => {
        if (!DRAW_TOOLS.has(this.state.tool)) return;
        this.setState((state) => ({
          ...state,
          connectionDraft: {
            kind: state.tool,
            source: { nodeId, portId: String(portId) },
            vertices: [],
            pointer: null,
            routing: state.settings.routingMode,
          },
        }));
      },

      addConnectionVertex: (point) => {
        const draft = this.state.connectionDraft;
        if (!draft) return;
        const snapped = snapPoint(point, this.state.settings.gridSize, this.state.settings.snapToGrid);
        const sourceNode = this.state.document.nodes[draft.source.nodeId];
        if (!sourceNode) return;
        const anchor = draft.vertices.at(-1) ?? getPortWorldPosition(sourceNode, draft.source.portId);
        const vertex = draft.routing === "orthogonal" ? orthogonalizeWaypoint(anchor, snapped) : snapped;
        this.setState((state) => ({
          ...state,
          connectionDraft: { ...state.connectionDraft, vertices: [...state.connectionDraft.vertices, vertex] },
        }));
      },

      updateConnectionPointer: (point) => {
        if (!this.state.connectionDraft) return;
        this.setState((state) => ({ ...state, connectionDraft: { ...state.connectionDraft, pointer: point } }));
      },

      completeConnection: (nodeId, portId) => {
        const draft = this.state.connectionDraft;
        if (!draft) {
          this.actions.startConnection(nodeId, portId);
          return;
        }
        if (draft.source.nodeId === nodeId && draft.source.portId === String(portId)) {
          this.actions.cancelConnection();
          return;
        }
        const next = cloneDiagram(this.state.document);
        this.completeConnectionIntoDocument(next, nodeId, String(portId));
      },

      cancelConnection: () => {
        this.setState((state) => ({ ...state, connectionDraft: null }));
      },

      updateEdgeVertex: (edgeId, vertexIndex, point) => {
        const snapped = snapPoint(point, this.state.settings.gridSize, this.state.settings.snapToGrid);
        this.mutateDocument((document) => {
          const edge = document.edges[edgeId];
          if (!edge) return;
          if (edge.routing === "orthogonal") {
            edge.vertices = getEdgePoints(document, edge).slice(1, -1);
            edge.routing = "free";
          }
          if (edge.vertices[vertexIndex]) edge.vertices[vertexIndex] = snapped;
        });
      },

      addEdgeVertex: () => {
        const { edgeId, vertexIndex } = this.state.selection;
        const edge = edgeId ? this.state.document.edges[edgeId] : null;
        if (!edge) return;
        this.mutateDocument((document) => {
          const mutable = document.edges[edgeId];
          if (mutable.routing === "orthogonal") {
            mutable.vertices = getEdgePoints(document, mutable).slice(1, -1);
            mutable.routing = "free";
          }
          const fullPath = getEdgePoints(document, mutable);
          const insertAt = vertexIndex === null ? mutable.vertices.length : vertexIndex + 1;
          const before = vertexIndex === null ? fullPath.at(-2) : mutable.vertices[vertexIndex];
          const after = vertexIndex === null ? fullPath.at(-1) : (mutable.vertices[vertexIndex + 1] ?? fullPath.at(-1));
          mutable.vertices.splice(insertAt, 0, snapPoint({ x: (before.x + after.x) / 2, y: (before.y + after.y) / 2 }, this.state.settings.gridSize, true));
        });
      },

      deleteEdgeVertex: () => {
        const { edgeId, vertexIndex } = this.state.selection;
        if (!edgeId || vertexIndex === null) return;
        this.mutateDocument((document) => {
          const edge = document.edges[edgeId];
          if (edge) edge.vertices.splice(vertexIndex, 1);
        });
        this.setState((state) => ({ ...state, selection: { ...state.selection, vertexIndex: null } }));
      },

      setEdgeRouting: (edgeId, routing) => {
        this.mutateDocument((document) => {
          const edge = document.edges[edgeId];
          if (!edge) return;
          if (routing === "free" && edge.routing === "orthogonal") edge.vertices = getEdgePoints(document, edge).slice(1, -1);
          if (routing === "orthogonal") edge.vertices = [];
          edge.routing = routing;
        });
      },

      setViewport: (viewport) => this.setState((state) => ({ ...state, viewport: { ...viewport } })),
      panViewport: (delta) => this.setState((state) => ({ ...state, viewport: { ...state.viewport, x: state.viewport.x + delta.x, y: state.viewport.y + delta.y } })),
      zoomAt: (screenPoint, factor) => this.setState((state) => ({ ...state, viewport: zoomViewportAt(state.viewport, screenPoint, state.viewport.scale * factor) })),
      resetViewport: () => this.setState((state) => ({ ...state, viewport: { x: 80, y: 70, scale: 4 } })),
      toggleSetting: (key) => this.setState((state) => ({ ...state, settings: { ...state.settings, [key]: !state.settings[key] } })),

      undo: () => {
        if (this.readOnly) return;
        const previous = this.past.at(-1);
        if (!previous) return;
        this.future = [cloneDiagram(this.state.document), ...this.future].slice(0, HISTORY_LIMIT);
        this.past = this.past.slice(0, -1);
        this.setState((state) => ({
          ...state,
          document: previous,
          selection: { nodeIds: [], edgeId: null, vertexIndex: null },
          connectionDraft: null,
          persistence: { status: "dirty", message: "Cambios pendientes" },
        }));
      },

      redo: () => {
        if (this.readOnly) return;
        const next = this.future[0];
        if (!next) return;
        this.past = [...this.past, cloneDiagram(this.state.document)].slice(-HISTORY_LIMIT);
        this.future = this.future.slice(1);
        this.setState((state) => ({
          ...state,
          document: next,
          selection: { nodeIds: [], edgeId: null, vertexIndex: null },
          connectionDraft: null,
          persistence: { status: "dirty", message: "Cambios pendientes" },
        }));
      },

      canUndo: () => !this.readOnly && this.past.length > 0,
      canRedo: () => !this.readOnly && this.future.length > 0,
    };
  }

  completeConnectionIntoDocument(nextDocument, nodeId, portId) {
    const draft = this.state.connectionDraft;
    if (!draft) return;
    const edge = createEdge(draft.source, { nodeId, portId: String(portId) }, {
      kind: draft.kind,
      routing: draft.routing,
      vertices: draft.vertices,
    });
    nextDocument.edges[edge.id] = edge;
    const decision = propagateConnectionVoltage(nextDocument, edge);
    this.commitDocument(nextDocument);
    this.setState((state) => ({
      ...state,
      connectionDraft: null,
      selection: { nodeIds: [], edgeId: edge.id, vertexIndex: null },
      tool: "select",
    }));
    if (decision.conflict) this.setNotice("Se unificaron dos redes con niveles distintos; prevaleció el nivel de la red más extensa.", "warning");
    else this.setNotice(edge.kind === "line" ? "Línea eléctrica creada." : "Path visual creado.", "success");
  }
}
