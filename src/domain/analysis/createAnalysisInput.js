import { normalizeAnalysisConfiguration } from "./analysisConfiguration.js";
import { evaluateAnalysisReadiness } from "./analysisReadiness.js";
import { applyOperatingCaseToComponent, getOperatingCase } from "./operatingCases.js";

export function createAnalysisRequestPreview(document, {
  diagramId = document.id,
  operatingCaseId,
  analysisType,
  executionPreference,
  expectedDiagramVersion = "<storageVersion>",
  clientRequestId = "<clientRequestId>",
} = {}) {
  const configuration = normalizeAnalysisConfiguration(document.analysisConfiguration);
  const operatingCase = getOperatingCase(document, operatingCaseId);
  return {
    diagramId,
    operatingCaseId: operatingCase.id,
    analysisType: analysisType ?? configuration.defaultAnalysisType,
    executionPreference: executionPreference ?? configuration.defaultExecutionPreference,
    expectedDiagramVersion,
    clientRequestId,
  };
}

export function createAnalysisInputPreview(document, {
  studyId = "<studyId>",
  diagramId = document.id,
  diagramStorageVersion = "<storageVersion>",
  operatingCaseId,
  analysisType,
} = {}) {
  const validation = evaluateAnalysisReadiness(document);
  const configuration = normalizeAnalysisConfiguration(document.analysisConfiguration);
  const operatingCase = getOperatingCase(document, operatingCaseId);
  return {
    schemaVersion: 1,
    studyId,
    diagramId,
    diagramStorageVersion,
    operatingCaseId: operatingCase.id,
    analysisType: analysisType ?? configuration.defaultAnalysisType,
    solverOptions: structuredClone(configuration.solverOptions),
    validation: {
      readiness: validation.readiness,
      errors: validation.errors,
      warnings: validation.warnings,
      statistics: validation.statistics,
    },
    electricalModel: {
      ...validation.model,
      components: validation.model.components.map((component) => applyOperatingCaseToComponent(component, operatingCase)),
    },
  };
}
