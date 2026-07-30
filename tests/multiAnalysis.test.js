import { describe, expect, it } from "vitest";
import {
  ANALYSIS_TYPES,
  normalizeAnalysisOptions,
} from "../src/domain/analysis/analysisRegistry.js";
import {
  analysisResultViews,
  getAnalysisNetworkResult,
  normalizeAnalysisOverlayOptions,
  parseAnalysisResultText,
} from "../src/domain/analysis/analysisResults.js";
import { createAnalysisInputPreview } from "../src/domain/analysis/createAnalysisInput.js";
import { createSampleDiagram } from "../src/domain/diagram/sampleDiagram.js";
import { createOperatingCase } from "../src/domain/analysis/operatingCases.js";

describe("arquitectura multi-análisis", () => {
  it("registra los cinco estudios iniciales", () => {
    expect(ANALYSIS_TYPES).toEqual([
      "POWER_FLOW",
      "DC_POWER_FLOW",
      "CONTINGENCY_N_1",
      "OPERATING_CASE_SWEEP",
      "LOADABILITY",
    ]);
  });

  it("normaliza límites de una contingencia", () => {
    expect(normalizeAnalysisOptions("CONTINGENCY_N_1", {
      maximumContingencies: 1000,
      minimumVoltagePu: 0.92,
    })).toMatchObject({
      maximumContingencies: 100,
      minimumVoltagePu: 0.92,
      includeLines: true,
      includeTransformers: true,
    });
  });

  it("genera escenarios completos para un barrido", () => {
    const diagram = createSampleDiagram();
    const second = createOperatingCase("Demanda alta");
    second.overrides["load-1"] = { activePowerKw: 26000 };
    diagram.operatingCases.push(second);
    const input = createAnalysisInputPreview(diagram, {
      studyId: "study-sweep",
      diagramStorageVersion: 4,
      analysisType: "OPERATING_CASE_SWEEP",
      analysisOptions: { caseIds: [second.id] },
    });
    expect(input.schemaVersion).toBe(2);
    expect(input.analysisType).toBe("OPERATING_CASE_SWEEP");
    expect(input.scenarios).toHaveLength(1);
    expect(input.scenarios[0].operatingCaseId).toBe(second.id);
  });

  it("expone una vista seleccionable por contingencia", () => {
    const result = parseAnalysisResultText(JSON.stringify({
      schemaVersion: 2,
      studyId: "study-1",
      diagramId: "diagram-1",
      analysisType: "CONTINGENCY_N_1",
      baseCase: { buses: [{ busId: "b1", voltagePu: 1 }], branches: [] },
      contingencies: [{
        componentId: "line-1",
        componentKind: "LINE",
        status: "CONVERGED",
        networkResult: { buses: [{ busId: "b1", voltagePu: 0.97 }], branches: [] },
      }],
    }));
    const views = analysisResultViews(result);
    expect(views.map((item) => item.id)).toEqual(["base", "contingency:line-1"]);
    expect(getAnalysisNetworkResult(result, "contingency:line-1").buses[0].voltagePu).toBe(0.97);
  });
  it("normaliza las métricas granulares de las etiquetas y conserva opciones antiguas", () => {
    const options = normalizeAnalysisOverlayOptions({
      showBusVoltages: false,
      showActivePowerFlows: false,
      showEquipmentPower: false,
      showBranchCurrent: true,
    });
    expect(options.showBusVoltagePu).toBe(false);
    expect(options.showBusVoltageKv).toBe(false);
    expect(options.showBranchActivePower).toBe(false);
    expect(options.showGeneratorActivePower).toBe(false);
    expect(options.showLoadReactivePower).toBe(false);
    expect(options.showBranchCurrent).toBe(true);
  });

});
