export const ANALYSIS_TYPES = Object.freeze(["POWER_FLOW"]);
export const EXECUTION_PREFERENCES = Object.freeze(["AUTO", "STANDARD", "ADVANCED"]);
export const POWER_FLOW_ALGORITHMS = Object.freeze([
  "NEWTON_RAPHSON",
  "FAST_DECOUPLED",
  "GAUSS_SEIDEL",
]);

export function createDefaultAnalysisConfiguration(overrides = {}) {
  return {
    defaultAnalysisType: overrides.defaultAnalysisType ?? "POWER_FLOW",
    defaultExecutionPreference: overrides.defaultExecutionPreference ?? "AUTO",
    solverOptions: {
      algorithm: "NEWTON_RAPHSON",
      tolerance: 0.000001,
      maximumIterations: 20,
      initializeFromPreviousResult: false,
      calculateVoltageAngles: true,
      enforceReactiveLimits: true,
      ...(overrides.solverOptions ?? {}),
    },
    validationOptions: {
      allowAssumedParameters: true,
      requireThermalLimits: false,
      ...(overrides.validationOptions ?? {}),
    },
  };
}

export function normalizeAnalysisConfiguration(candidate = {}) {
  const normalized = createDefaultAnalysisConfiguration(candidate);
  if (!ANALYSIS_TYPES.includes(normalized.defaultAnalysisType)) {
    normalized.defaultAnalysisType = "POWER_FLOW";
  }
  if (!EXECUTION_PREFERENCES.includes(normalized.defaultExecutionPreference)) {
    normalized.defaultExecutionPreference = "AUTO";
  }
  if (!POWER_FLOW_ALGORITHMS.includes(normalized.solverOptions.algorithm)) {
    normalized.solverOptions.algorithm = "NEWTON_RAPHSON";
  }
  normalized.solverOptions.tolerance = Math.max(
    Number.EPSILON,
    Number(normalized.solverOptions.tolerance) || 0.000001,
  );
  normalized.solverOptions.maximumIterations = Math.max(
    1,
    Math.round(Number(normalized.solverOptions.maximumIterations) || 20),
  );
  return normalized;
}
