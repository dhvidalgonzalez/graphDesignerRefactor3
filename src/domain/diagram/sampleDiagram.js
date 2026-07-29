import { createDiagramWithEntities } from "./serialization.js";

export function createSampleDiagram() {
  return createDiagramWithEntities({
    id: "prototype-diagram",
    name: "Subestación de prueba",
    metadata: {
      activeVoltageLevelId: "vl-66",
    },
    nodes: [
      {
        id: "term-220",
        type: "ElmTerm",
        position: { x: 45, y: 25 },
        ports: [{ id: "tap-main", name: "Bajada principal", x: 0, y: 0 }],
        properties: { name: "Barra 220 kV", voltageLevelId: "vl-220", sizeX: 2.5, symbolName: "TermStrip", shortCircuitCurrentKA: 31.5 },
      },
      {
        id: "tr2-main",
        type: "ElmTr2",
        position: { x: 45, y: 48 },
        properties: { name: "T1", voltageLevelId1: "vl-220", voltageLevelId2: "vl-66", ratedPowerMVA: 75, impedancePercent: 12.5 },
      },
      {
        id: "term-66",
        type: "ElmTerm",
        position: { x: 45, y: 72 },
        ports: [
          { id: "tap-up", name: "Transformador", x: 0, y: 0 },
          { id: "tap-left", name: "Generador", x: -20, y: 0 },
          { id: "tap-right", name: "Carga", x: 20, y: 0 },
          { id: "tap-coupler", name: "Salida de línea", x: 30, y: 0 },
        ],
        properties: { name: "Barra 66 kV", voltageLevelId: "vl-66", sizeX: 2, symbolName: "TermStrip", shortCircuitCurrentKA: 25 },
      },
      {
        id: "load-1",
        type: "ElmLod",
        position: { x: 75, y: 102 },
        properties: { name: "Carga industrial", voltageLevelId: "vl-66", activePowerMW: 18, reactivePowerMvar: 5.2 },
      },
      {
        id: "generator-1",
        type: "ElmSym",
        position: { x: 18, y: 102 },
        properties: { name: "G1", voltageLevelId: "vl-66", sourceType: "GENERATOR", controlMode: "SLACK", voltageSetpointPu: 1.02, ratedPowerMVA: 35, activePowerMW: 28 },
      },
      {
        id: "term-remote",
        type: "ElmTerm",
        position: { x: 112, y: 72 },
        ports: [{ id: "tap-line", name: "Entrada de línea", x: -10, y: 0 }],
        properties: { name: "Barra remota", voltageLevelId: "vl-66", sizeX: 1.2, symbolName: "TermStrip" },
      },
    ],
    edges: [
      {
        id: "path-1",
        kind: "path",
        source: { nodeId: "term-220", portId: "tap-main" },
        target: { nodeId: "tr2-main", portId: "1" },
        routing: "orthogonal",
        properties: { voltageLevelId: "vl-220" },
      },
      {
        id: "path-2",
        kind: "path",
        source: { nodeId: "tr2-main", portId: "2" },
        target: { nodeId: "term-66", portId: "tap-up" },
        routing: "orthogonal",
        properties: { voltageLevelId: "vl-66" },
      },
      {
        id: "path-3",
        kind: "path",
        source: { nodeId: "term-66", portId: "tap-left" },
        target: { nodeId: "generator-1", portId: "1" },
        routing: "orthogonal",
        vertices: [{ x: 18, y: 72 }],
        properties: { voltageLevelId: "vl-66" },
      },
      {
        id: "path-4",
        kind: "path",
        source: { nodeId: "term-66", portId: "tap-right" },
        target: { nodeId: "load-1", portId: "1" },
        routing: "orthogonal",
        vertices: [{ x: 75, y: 72 }],
        properties: { voltageLevelId: "vl-66" },
      },
      {
        id: "line-main",
        kind: "line",
        source: { nodeId: "term-66", portId: "tap-coupler" },
        target: { nodeId: "term-remote", portId: "tap-line" },
        routing: "free",
        vertices: [{ x: 86, y: 62 }, { x: 98, y: 80 }],
        properties: {
          name: "Línea 66 kV Norte",
          voltageLevelId: "vl-66",
          lengthKm: 18.4,
          circuitCount: 1,
          conductor: "AAAC 400 mm²",
          ratedCurrentA: 760,
          resistanceOhmPerKm: 0.078,
          reactanceOhmPerKm: 0.34,
          susceptanceUsPerKm: 3.6,
        },
      },
    ],
  });
}
