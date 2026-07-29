import {
  getNodePortVoltageLevelId,
  getNodePorts,
  getSymbolDefinition,
} from "../catalog/symbolCatalog.js";
import { getVoltageLevel } from "./voltageLevels.js";
import { createParameterValue, getParameterMetadata } from "./parameterValue.js";

const COMPONENT_KIND_BY_SYMBOL = Object.freeze({
  ElmTerm: "BUS",
  ElmLod: "LOAD",
  ElmSym: "GENERATOR",
  ElmGenstat: "GENERATOR",
  ElmCoup: "SWITCH",
  ElmShnt: "SHUNT",
  ElmTr2: "TRANSFORMER_2W",
  ElmTr3: "TRANSFORMER_3W",
});

class UnionFind {
  constructor(keys) {
    this.parent = new Map(keys.map((key) => [key, key]));
  }

  find(key) {
    const parent = this.parent.get(key);
    if (parent === undefined) return null;
    if (parent === key) return key;
    const root = this.find(parent);
    this.parent.set(key, root);
    return root;
  }

  union(a, b) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (!rootA || !rootB || rootA === rootB) return;
    const [first, second] = [rootA, rootB].sort();
    this.parent.set(second, first);
  }
}

function endpointKey(nodeId, portId) {
  return `${nodeId}::${String(portId)}`;
}

function hashToken(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function parameter(entity, key, fallbackSource = "IMPORTED") {
  return createParameterValue(
    entity.properties?.[key],
    getParameterMetadata(entity, key, fallbackSource),
  );
}

function calculatedParameter(value, status = "CONFIRMED") {
  return createParameterValue(value, { source: "CALCULATED", status });
}

function valueOrNull(value) {
  return value === undefined || value === null || value === "" ? null : value;
}

function canonicalParameters(entity, kind, document) {
  const common = {
    outOfService: parameter(entity, "outOfService"),
    description: parameter(entity, "description"),
    assetCode: parameter(entity, "assetCode"),
    manufacturer: parameter(entity, "manufacturer"),
    model: parameter(entity, "model"),
    commissioningYear: parameter(entity, "commissioningYear"),
  };

  const firstVoltageId = kind === "TRANSFORMER_2W" || kind === "TRANSFORMER_3W"
    ? entity.properties?.voltageLevelId1
    : entity.properties?.voltageLevelId;
  const voltage = getVoltageLevel(document.metadata, firstVoltageId);

  if (kind === "BUS") {
    return {
      ...common,
      voltageLevelId: parameter(entity, "voltageLevelId"),
      nominalVoltageKv: calculatedParameter(voltage?.value ?? null, voltage ? "CONFIRMED" : "MISSING"),
      busType: parameter(entity, "busType"),
      voltageSetpointPu: parameter(entity, "voltageSetpointPu"),
      minimumVoltagePu: parameter(entity, "minimumVoltagePu"),
      maximumVoltagePu: parameter(entity, "maximumVoltagePu"),
      shortCircuitCurrentKA: parameter(entity, "shortCircuitCurrentKA"),
      grounding: parameter(entity, "grounding"),
      substation: parameter(entity, "substation"),
      area: parameter(entity, "area"),
    };
  }

  if (kind === "LOAD") {
    const activePowerMW = valueOrNull(entity.properties?.activePowerMW);
    const reactivePowerMvar = valueOrNull(entity.properties?.reactivePowerMvar);
    return {
      ...common,
      voltageLevelId: parameter(entity, "voltageLevelId"),
      nominalVoltageKv: calculatedParameter(voltage?.value ?? null, voltage ? "CONFIRMED" : "MISSING"),
      activePowerMW: parameter(entity, "activePowerMW"),
      reactivePowerMvar: parameter(entity, "reactivePowerMvar"),
      activePowerKw: calculatedParameter(activePowerMW === null ? null : Number(activePowerMW) * 1000, activePowerMW === null ? "MISSING" : "CONFIRMED"),
      reactivePowerKvar: calculatedParameter(reactivePowerMvar === null ? null : Number(reactivePowerMvar) * 1000, reactivePowerMvar === null ? "MISSING" : "CONFIRMED"),
      powerFactor: parameter(entity, "powerFactor"),
      loadModel: parameter(entity, "loadModel"),
    };
  }

  if (kind === "GENERATOR" || kind === "EXTERNAL_GRID") {
    const activePowerMW = valueOrNull(entity.properties?.activePowerMW);
    const reactivePowerMvar = valueOrNull(entity.properties?.reactivePowerMvar);
    return {
      ...common,
      voltageLevelId: parameter(entity, "voltageLevelId"),
      nominalVoltageKv: calculatedParameter(voltage?.value ?? null, voltage ? "CONFIRMED" : "MISSING"),
      sourceType: parameter(entity, "sourceType"),
      controlMode: parameter(entity, "controlMode"),
      ratedPowerMVA: parameter(entity, "ratedPowerMVA"),
      activePowerMW: parameter(entity, "activePowerMW"),
      reactivePowerMvar: parameter(entity, "reactivePowerMvar"),
      activePowerKw: calculatedParameter(activePowerMW === null ? null : Number(activePowerMW) * 1000, activePowerMW === null ? "MISSING" : "CONFIRMED"),
      reactivePowerKvar: calculatedParameter(reactivePowerMvar === null ? null : Number(reactivePowerMvar) * 1000, reactivePowerMvar === null ? "MISSING" : "CONFIRMED"),
      voltageSetpointPu: parameter(entity, "voltageSetpointPu"),
      minimumReactivePowerMvar: parameter(entity, "minimumReactivePowerMvar"),
      maximumReactivePowerMvar: parameter(entity, "maximumReactivePowerMvar"),
      xdPerUnit: parameter(entity, "xdPerUnit"),
      inertiaSeconds: parameter(entity, "inertiaSeconds"),
      technology: parameter(entity, "technology"),
    };
  }

  if (kind === "SWITCH") {
    return {
      ...common,
      voltageLevelId: parameter(entity, "voltageLevelId"),
      nominalVoltageKv: calculatedParameter(voltage?.value ?? null, voltage ? "CONFIRMED" : "MISSING"),
      state: calculatedParameter(entity.properties?.switchingState === "Abierto" ? "OPEN" : "CLOSED"),
      switchingState: parameter(entity, "switchingState"),
      breakerType: parameter(entity, "breakerType"),
      ratedCurrentA: parameter(entity, "ratedCurrentA"),
      interruptingCurrentKA: parameter(entity, "interruptingCurrentKA"),
    };
  }

  if (kind === "SHUNT") {
    const reactivePowerMvar = valueOrNull(entity.properties?.reactivePowerMvar);
    return {
      ...common,
      voltageLevelId: parameter(entity, "voltageLevelId"),
      nominalVoltageKv: calculatedParameter(voltage?.value ?? null, voltage ? "CONFIRMED" : "MISSING"),
      reactivePowerMvar: parameter(entity, "reactivePowerMvar"),
      reactivePowerKvar: calculatedParameter(reactivePowerMvar === null ? null : Number(reactivePowerMvar) * 1000, reactivePowerMvar === null ? "MISSING" : "CONFIRMED"),
      steps: parameter(entity, "steps"),
      controlMode: parameter(entity, "controlMode"),
    };
  }

  if (kind === "TRANSFORMER_2W") {
    const primaryVoltage = getVoltageLevel(document.metadata, entity.properties?.voltageLevelId1);
    const secondaryVoltage = getVoltageLevel(document.metadata, entity.properties?.voltageLevelId2);
    return {
      ...common,
      primaryVoltageLevelId: parameter(entity, "voltageLevelId1"),
      secondaryVoltageLevelId: parameter(entity, "voltageLevelId2"),
      primaryNominalVoltageKv: calculatedParameter(primaryVoltage?.value ?? null, primaryVoltage ? "CONFIRMED" : "MISSING"),
      secondaryNominalVoltageKv: calculatedParameter(secondaryVoltage?.value ?? null, secondaryVoltage ? "CONFIRMED" : "MISSING"),
      ratedPowerMVA: parameter(entity, "ratedPowerMVA"),
      vectorGroup: parameter(entity, "vectorGroup"),
      impedancePercent: parameter(entity, "impedancePercent"),
      resistancePercent: parameter(entity, "resistancePercent"),
      noLoadLossKw: parameter(entity, "noLoadLossKw"),
      magnetizingCurrentPercent: parameter(entity, "magnetizingCurrentPercent"),
      tapPosition: parameter(entity, "tapPosition"),
      tapMin: parameter(entity, "tapMin"),
      tapMax: parameter(entity, "tapMax"),
      tapStepPercent: parameter(entity, "tapStepPercent"),
      cooling: parameter(entity, "cooling"),
    };
  }

  if (kind === "TRANSFORMER_3W") {
    return {
      ...common,
      voltageLevelId1: parameter(entity, "voltageLevelId1"),
      voltageLevelId2: parameter(entity, "voltageLevelId2"),
      voltageLevelId3: parameter(entity, "voltageLevelId3"),
      ratedPowerMVA: parameter(entity, "ratedPowerMVA"),
      vectorGroup: parameter(entity, "vectorGroup"),
      impedance12Percent: parameter(entity, "impedance12Percent"),
      impedance13Percent: parameter(entity, "impedance13Percent"),
      impedance23Percent: parameter(entity, "impedance23Percent"),
      tapPosition: parameter(entity, "tapPosition"),
    };
  }

  if (kind === "LINE") {
    return {
      ...common,
      voltageLevelId: parameter(entity, "voltageLevelId"),
      nominalVoltageKv: calculatedParameter(voltage?.value ?? null, voltage ? "CONFIRMED" : "MISSING"),
      lengthKm: parameter(entity, "lengthKm"),
      circuitCount: parameter(entity, "circuitCount"),
      conductor: parameter(entity, "conductor"),
      ratedCurrentA: parameter(entity, "ratedCurrentA"),
      resistanceOhmPerKm: parameter(entity, "resistanceOhmPerKm"),
      reactanceOhmPerKm: parameter(entity, "reactanceOhmPerKm"),
      susceptanceUsPerKm: parameter(entity, "susceptanceUsPerKm"),
    };
  }

  return common;
}

function nodeKind(node) {
  const baseKind = COMPONENT_KIND_BY_SYMBOL[node.type] ?? null;
  if (baseKind === "GENERATOR" && node.properties?.sourceType === "EXTERNAL_GRID") {
    return "EXTERNAL_GRID";
  }
  return baseKind;
}

function terminalRole(node, port) {
  if (node.type === "ElmTr2") return String(port.id) === "1" ? "PRIMARY" : "SECONDARY";
  if (node.type === "ElmTr3") return `WINDING_${String(port.id)}`;
  if (node.type === "ElmCoup") return String(port.id) === "1" ? "SIDE_A" : "SIDE_B";
  return port.name || "CONNECTION";
}

export function buildElectricalModel(document) {
  const electricalNodes = Object.values(document.nodes ?? {}).filter((node) => {
    try {
      return getSymbolDefinition(node.type).electrical !== false;
    } catch {
      return false;
    }
  });

  const endpointRecords = [];
  electricalNodes.forEach((node) => {
    getNodePorts(node).forEach((port) => {
      endpointRecords.push({
        key: endpointKey(node.id, port.id),
        node,
        port,
        voltageLevelId: getNodePortVoltageLevelId(node, port.id),
      });
    });
  });

  const endpointSet = new Set(endpointRecords.map((item) => item.key));
  const unionFind = new UnionFind(endpointRecords.map((item) => item.key));

  electricalNodes
    .filter((node) => node.type === "ElmTerm")
    .forEach((node) => {
      const portKeys = getNodePorts(node).map((port) => endpointKey(node.id, port.id));
      const anchor = portKeys[0];
      portKeys.slice(1).forEach((key) => unionFind.union(anchor, key));
    });

  Object.values(document.edges ?? {})
    .filter((edge) => edge.kind === "path")
    .forEach((edge) => {
      const sourceKey = endpointKey(edge.source.nodeId, edge.source.portId);
      const targetKey = endpointKey(edge.target.nodeId, edge.target.portId);
      if (endpointSet.has(sourceKey) && endpointSet.has(targetKey)) {
        unionFind.union(sourceKey, targetKey);
      }
    });

  const groups = new Map();
  endpointRecords.forEach((record) => {
    const root = unionFind.find(record.key) ?? record.key;
    groups.set(root, [...(groups.get(root) ?? []), record]);
  });

  const connectionNodeIdByEndpoint = new Map();
  const connectionNodes = [...groups.values()].map((records) => {
    const sortedKeys = records.map((record) => record.key).sort();
    const busIds = [...new Set(records.filter((record) => record.node.type === "ElmTerm").map((record) => record.node.id))].sort();
    const id = busIds.length === 1
      ? `cn-${busIds[0]}`
      : `cn-${hashToken(sortedKeys.join("|"))}`;
    records.forEach((record) => connectionNodeIdByEndpoint.set(record.key, id));

    const voltageIds = [...new Set(records.map((record) => record.voltageLevelId).filter(Boolean))].sort();
    const voltageId = voltageIds[0] ?? null;
    const voltage = getVoltageLevel(document.metadata, voltageId);
    return {
      id,
      nominalVoltageKv: voltage?.value ?? null,
      voltageLevelId: voltageId,
      voltageLevelIds: voltageIds,
      voltageConflict: voltageIds.length > 1,
      ...(busIds[0] ? { busComponentId: busIds[0] } : {}),
      memberEndpointIds: sortedKeys,
    };
  });

  const components = [];
  const terminals = [];

  electricalNodes.forEach((node) => {
    const kind = nodeKind(node);
    if (!kind) return;
    const ports = getNodePorts(node);
    components.push({
      id: node.id,
      kind,
      name: node.properties?.name || getSymbolDefinition(node.type).displayName,
      inService: !Boolean(node.properties?.outOfService),
      sourceEntity: { type: "NODE", id: node.id, symbolType: node.type },
      terminalIds: ports.map((port) => `${node.id}:terminal:${String(port.id)}`),
      parameters: canonicalParameters(node, kind, document),
    });
    ports.forEach((port) => {
      terminals.push({
        id: `${node.id}:terminal:${String(port.id)}`,
        componentId: node.id,
        role: terminalRole(node, port),
        connectionNodeId: connectionNodeIdByEndpoint.get(endpointKey(node.id, port.id)) ?? null,
        sourceEndpoint: { nodeId: node.id, portId: String(port.id) },
      });
    });
  });

  Object.values(document.edges ?? {})
    .filter((edge) => edge.kind === "line")
    .forEach((edge) => {
      const sourceKey = endpointKey(edge.source.nodeId, edge.source.portId);
      const targetKey = endpointKey(edge.target.nodeId, edge.target.portId);
      const terminalIds = [`${edge.id}:terminal:from`, `${edge.id}:terminal:to`];
      components.push({
        id: edge.id,
        kind: "LINE",
        name: edge.properties?.name || "Línea eléctrica",
        inService: !Boolean(edge.properties?.outOfService),
        sourceEntity: { type: "EDGE", id: edge.id, edgeKind: edge.kind },
        terminalIds,
        parameters: canonicalParameters(edge, "LINE", document),
      });
      terminals.push(
        {
          id: terminalIds[0],
          componentId: edge.id,
          role: "FROM",
          connectionNodeId: connectionNodeIdByEndpoint.get(sourceKey) ?? null,
          sourceEndpoint: { ...edge.source },
        },
        {
          id: terminalIds[1],
          componentId: edge.id,
          role: "TO",
          connectionNodeId: connectionNodeIdByEndpoint.get(targetKey) ?? null,
          sourceEndpoint: { ...edge.target },
        },
      );
    });

  return {
    schemaVersion: 1,
    components,
    terminals,
    connectionNodes,
  };
}

export function synchronizeElectricalModel(document) {
  document.electricalModel = buildElectricalModel(document);
  return document;
}

export function getElectricalModelStatistics(document) {
  const model = document.electricalModel?.components ? document.electricalModel : buildElectricalModel(document);
  const byKind = model.components.reduce((counts, component) => ({
    ...counts,
    [component.kind]: (counts[component.kind] ?? 0) + 1,
  }), {});
  return {
    componentCount: model.components.length,
    terminalCount: model.terminals.length,
    connectionNodeCount: model.connectionNodes.length,
    busCount: model.connectionNodes.length,
    explicitBusCount: byKind.BUS ?? 0,
    branchCount: (byKind.LINE ?? 0) + (byKind.TRANSFORMER_2W ?? 0) + (byKind.TRANSFORMER_3W ?? 0) + (byKind.SWITCH ?? 0),
    loadCount: byKind.LOAD ?? 0,
    generatorCount: (byKind.GENERATOR ?? 0) + (byKind.EXTERNAL_GRID ?? 0),
    switchCount: byKind.SWITCH ?? 0,
    shuntCount: byKind.SHUNT ?? 0,
    byKind,
  };
}
