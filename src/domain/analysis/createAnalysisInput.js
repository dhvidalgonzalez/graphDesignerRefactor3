import { normalizeAnalysisConfiguration } from "./analysisConfiguration.js";
import { normalizeAnalysisOptions } from "./analysisRegistry.js";
import { evaluateAnalysisReadinessForType } from "./analysisReadiness.js";
import { getOperatingCase, normalizeOperatingCases } from "./operatingCases.js";

function validationSnapshot(validation) {
  return {
    readiness: validation.readiness,
    errors: validation.errors,
    warnings: validation.warnings,
    statistics: validation.statistics,
  };
}

function scopeSnapshot(validation) {
  return structuredClone(validation.topologyScope ?? {});
}

export function createAnalysisRequestPreview(document, {
  diagramId = document.id,
  operatingCaseId = undefined,
  analysisType = undefined,
  analysisOptions = undefined,
  executionPreference = undefined,
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
  operatingCaseId = undefined,
  analysisType = undefined,
  analysisOptions = undefined,
} = {}) {
  const configuration = normalizeAnalysisConfiguration(document.analysisConfiguration);
  const selectedType = analysisType ?? configuration.defaultAnalysisType;
  const options = normalizeAnalysisOptions(selectedType, analysisOptions);
  const operatingCase = getOperatingCase(document, operatingCaseId);
  const validation = evaluateAnalysisReadinessForType(
    document,
    selectedType,
    options,
    { operatingCaseId: operatingCase.id },
  );
  const input = {
    schemaVersion: 2,
    studyId,
    diagramId,
    diagramStorageVersion,
    operatingCaseId: operatingCase.id,
    analysisType: selectedType,
    solverOptions: structuredClone(configuration.solverOptions),
    analysisOptions: options,
    validation: validationSnapshot(validation),
    networkScope: scopeSnapshot(validation),
    electricalModel: structuredClone(validation.model),
  };

  if (selectedType === "OPERATING_CASE_SWEEP") {
    const cases = normalizeOperatingCases(document.operatingCases);
    const selected = new Set(options.caseIds);
    const targets = selected.size ? cases.filter((item) => selected.has(item.id)) : cases;
    input.scenarios = targets.map((item) => {
      const scenarioValidation = evaluateAnalysisReadinessForType(
        document,
        selectedType,
        options,
        { operatingCaseId: item.id },
      );
      return {
        operatingCaseId: item.id,
        name: item.name,
        validation: validationSnapshot(scenarioValidation),
        networkScope: scopeSnapshot(scenarioValidation),
        electricalModel: structuredClone(scenarioValidation.model),
      };
    });
  }

  return input;
}
