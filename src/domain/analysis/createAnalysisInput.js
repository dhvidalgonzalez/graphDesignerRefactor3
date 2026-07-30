import { normalizeAnalysisConfiguration } from "./analysisConfiguration.js";
import { normalizeAnalysisOptions } from "./analysisRegistry.js";
import { evaluateAnalysisReadiness, evaluateAnalysisReadinessForType } from "./analysisReadiness.js";
import { applyOperatingCaseToComponent, getOperatingCase, normalizeOperatingCases } from "./operatingCases.js";

function modelForCase(validation, operatingCase) {
  return {
    ...validation.model,
    components: validation.model.components.map((component) => applyOperatingCaseToComponent(component, operatingCase)),
  };
}

export function createAnalysisRequestPreview(document, {
  diagramId = document.id,
  operatingCaseId,
  analysisType,
  analysisOptions,
  executionPreference,
  expectedDiagramVersion = "<storageVersion>",
  clientRequestId = "<clientRequestId>",
} = {}) {
  const configuration = normalizeAnalysisConfiguration(document.analysisConfiguration);
  const selectedType = analysisType ?? configuration.defaultAnalysisType;
  const operatingCase = getOperatingCase(document, operatingCaseId);
  return {
    diagramId,
    operatingCaseId: operatingCase.id,
    analysisType: selectedType,
    analysisOptionsJson: JSON.stringify(normalizeAnalysisOptions(selectedType, analysisOptions)),
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
  analysisOptions,
} = {}) {
  const configuration = normalizeAnalysisConfiguration(document.analysisConfiguration);
  const selectedType = analysisType ?? configuration.defaultAnalysisType;
  const options = normalizeAnalysisOptions(selectedType, analysisOptions);
  const validation = evaluateAnalysisReadinessForType(document, selectedType, options);
  const operatingCase = getOperatingCase(document, operatingCaseId);
  const input = {
    schemaVersion: 2,
    studyId,
    diagramId,
    diagramStorageVersion,
    operatingCaseId: operatingCase.id,
    analysisType: selectedType,
    solverOptions: structuredClone(configuration.solverOptions),
    analysisOptions: options,
    validation: {
      readiness: validation.readiness,
      errors: validation.errors,
      warnings: validation.warnings,
      statistics: validation.statistics,
    },
    electricalModel: modelForCase(validation, operatingCase),
  };

  if (selectedType === "OPERATING_CASE_SWEEP") {
    const cases = normalizeOperatingCases(document.operatingCases);
    const selected = new Set(options.caseIds);
    const targets = selected.size ? cases.filter((item) => selected.has(item.id)) : cases;
    input.scenarios = targets.map((item) => {
      const caseValidation = evaluateAnalysisReadiness(document);
      return {
        operatingCaseId: item.id,
        name: item.name,
        validation: {
          readiness: caseValidation.readiness,
          errors: caseValidation.errors,
          warnings: caseValidation.warnings,
          statistics: caseValidation.statistics,
        },
        electricalModel: modelForCase(caseValidation, item),
      };
    });
  }

  return input;
}
