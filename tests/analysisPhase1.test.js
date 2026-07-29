import { describe, expect, it } from "vitest";
import { createAnalysisInputPreview, createAnalysisRequestPreview } from "../src/domain/analysis/createAnalysisInput.js";
import { evaluateAnalysisReadiness } from "../src/domain/analysis/analysisReadiness.js";
import { createOperatingCase } from "../src/domain/analysis/operatingCases.js";
import { createSampleDiagram } from "../src/domain/diagram/sampleDiagram.js";
import { parseAndMigrateDiagram } from "../src/domain/diagram/migrateDiagram.js";

function component(model, id) {
  return model.components.find((item) => item.id === id);
}

describe("preparación de análisis eléctricos", () => {
  it("construye topología lógica sin confundir paths con líneas físicas", () => {
    const diagram = createSampleDiagram();
    const validation = evaluateAnalysisReadiness(diagram);
    const line = component(validation.model, "line-main");
    const lineTerminals = validation.model.terminals.filter((item) => item.componentId === line.id);

    expect(diagram.schemaVersion).toBe(3);
    expect(validation.errors).toEqual([]);
    expect(validation.statistics.busCount).toBe(3);
    expect(line.kind).toBe("LINE");
    expect(lineTerminals).toHaveLength(2);
    expect(lineTerminals[0].connectionNodeId).not.toBe(lineTerminals[1].connectionNodeId);
  });

  it("genera una solicitud semántica sin exponer claves S3", () => {
    const diagram = createSampleDiagram();
    const request = createAnalysisRequestPreview(diagram, {
      diagramId: "diagram-123",
      expectedDiagramVersion: 18,
      clientRequestId: "request-uuid",
    });

    expect(request).toMatchObject({
      diagramId: "diagram-123",
      operatingCaseId: "case-normal",
      analysisType: "POWER_FLOW",
      executionPreference: "AUTO",
      expectedDiagramVersion: 18,
      clientRequestId: "request-uuid",
    });
    expect(request.storageKey).toBeUndefined();
    expect(request.workspaceId).toBeUndefined();
  });

  it("aplica overrides de un caso de operación al snapshot", () => {
    const diagram = createSampleDiagram();
    const peakCase = createOperatingCase("Demanda máxima");
    peakCase.overrides["load-1"] = { activePowerKw: 25000, reactivePowerKvar: 8000 };
    diagram.operatingCases.push(peakCase);

    const input = createAnalysisInputPreview(diagram, {
      studyId: "study-1",
      diagramStorageVersion: 7,
      operatingCaseId: peakCase.id,
    });
    const load = component(input.electricalModel, "load-1");

    expect(input.diagramStorageVersion).toBe(7);
    expect(load.operatingState.activePowerKw).toBe(25000);
    expect(load.operatingState.reactivePowerKvar).toBe(8000);
  });

  it("migra un documento V2 y agrega la estructura analítica V3", () => {
    const current = createSampleDiagram();
    const v2 = structuredClone(current);
    v2.schemaVersion = 2;
    delete v2.electricalModel;
    delete v2.operatingCases;
    delete v2.analysisConfiguration;
    Object.values(v2.nodes).forEach((node) => delete node.parameterMetadata);
    Object.values(v2.edges).forEach((edge) => delete edge.parameterMetadata);

    const migrated = parseAndMigrateDiagram(v2);

    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.electricalModel.components.length).toBeGreaterThan(0);
    expect(migrated.operatingCases).toHaveLength(1);
    expect(migrated.analysisConfiguration.solverOptions.algorithm).toBe("NEWTON_RAPHSON");
    expect(migrated.nodes["term-220"].parameterMetadata.busType).toMatchObject({
      source: "DEFAULT",
      status: "ASSUMED",
    });
    expect(migrated.nodes["term-220"].parameterMetadata.shortCircuitCurrentKA).toMatchObject({
      source: "IMPORTED",
      status: "CONFIRMED",
    });
  });

  it("bloquea una isla energizada que no tiene referencia Slack", () => {
    const diagram = createSampleDiagram();
    diagram.nodes["generator-1"].properties.controlMode = "PV";
    const validation = evaluateAnalysisReadiness(diagram);

    expect(validation.readiness).toBe("NOT_READY");
    expect(validation.errors.some((item) => item.code === "NO_SLACK_REFERENCE")).toBe(true);
    expect(validation.errors.some((item) => item.code === "ENERGIZED_ISLAND_WITHOUT_REFERENCE")).toBe(true);
  });
});
