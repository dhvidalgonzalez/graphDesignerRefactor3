export const ANALYSIS_TYPES = Object.freeze([
  "POWER_FLOW",
  "DC_POWER_FLOW",
  "CONTINGENCY_N_1",
  "OPERATING_CASE_SWEEP",
  "LOADABILITY",
]);

export const ANALYSIS_DEFINITIONS = Object.freeze({
  POWER_FLOW: {
    id: "POWER_FLOW",
    label: "Flujo de carga AC",
    shortLabel: "Flujo AC",
    description: "Tensiones, ángulos, potencias, corrientes, pérdidas y cargabilidad en régimen permanente.",
    units: 1,
    supportsOverlay: true,
    resultMode: "NETWORK",
    defaultOptions: {},
  },
  DC_POWER_FLOW: {
    id: "DC_POWER_FLOW",
    label: "Flujo de carga DC",
    shortLabel: "Flujo DC",
    description: "Aproximación lineal para ángulos y flujos de potencia activa.",
    units: 1,
    supportsOverlay: true,
    resultMode: "NETWORK",
    defaultOptions: {
      calculateLineLoading: true,
    },
  },
  CONTINGENCY_N_1: {
    id: "CONTINGENCY_N_1",
    label: "Contingencia N-1",
    shortLabel: "N-1",
    description: "Retira una línea o transformador por vez y registra tensiones, sobrecargas y no convergencias.",
    units: 3,
    supportsOverlay: true,
    resultMode: "CONTINGENCY",
    defaultOptions: {
      includeLines: true,
      includeTransformers: true,
      selectedComponentIds: [],
      maximumContingencies: 50,
      minimumVoltagePu: 0.95,
      maximumVoltagePu: 1.05,
      maximumLoadingPercent: 100,
    },
  },
  OPERATING_CASE_SWEEP: {
    id: "OPERATING_CASE_SWEEP",
    label: "Barrido de casos de operación",
    shortLabel: "Barrido",
    description: "Ejecuta varios casos guardados y compara sus tensiones, cargabilidades y pérdidas.",
    units: 2,
    supportsOverlay: true,
    resultMode: "SCENARIOS",
    defaultOptions: {
      caseIds: [],
      minimumVoltagePu: 0.95,
      maximumVoltagePu: 1.05,
      maximumLoadingPercent: 100,
    },
  },
  LOADABILITY: {
    id: "LOADABILITY",
    label: "Margen de cargabilidad",
    shortLabel: "Cargabilidad",
    description: "Incrementa las cargas hasta alcanzar una violación de tensión, carga térmica o no convergencia.",
    units: 3,
    supportsOverlay: true,
    resultMode: "LOADABILITY",
    defaultOptions: {
      selectedComponentIds: [],
      startMultiplier: 1,
      maximumMultiplier: 2,
      step: 0.05,
      minimumVoltagePu: 0.95,
      maximumVoltagePu: 1.05,
      maximumLoadingPercent: 100,
      stopAtFirstViolation: true,
    },
  },
});

function finite(value, fallback, { minimum = -Infinity, maximum = Infinity } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function stringArray(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))]
    : [];
}

export function getAnalysisDefinition(analysisType) {
  return ANALYSIS_DEFINITIONS[analysisType] ?? ANALYSIS_DEFINITIONS.POWER_FLOW;
}

export function createDefaultAnalysisOptions(analysisType) {
  return structuredClone(getAnalysisDefinition(analysisType).defaultOptions);
}

export function normalizeAnalysisOptions(analysisType, candidate = {}) {
  const type = ANALYSIS_TYPES.includes(analysisType) ? analysisType : "POWER_FLOW";
  const defaults = createDefaultAnalysisOptions(type);
  const value = candidate && typeof candidate === "object" ? candidate : {};

  if (type === "CONTINGENCY_N_1") {
    return {
      includeLines: value.includeLines !== false,
      includeTransformers: value.includeTransformers !== false,
      selectedComponentIds: stringArray(value.selectedComponentIds),
      maximumContingencies: Math.round(finite(value.maximumContingencies, defaults.maximumContingencies, { minimum: 1, maximum: 100 })),
      minimumVoltagePu: finite(value.minimumVoltagePu, defaults.minimumVoltagePu, { minimum: 0.1, maximum: 1.5 }),
      maximumVoltagePu: finite(value.maximumVoltagePu, defaults.maximumVoltagePu, { minimum: 0.1, maximum: 1.5 }),
      maximumLoadingPercent: finite(value.maximumLoadingPercent, defaults.maximumLoadingPercent, { minimum: 1, maximum: 1000 }),
    };
  }

  if (type === "OPERATING_CASE_SWEEP") {
    return {
      caseIds: stringArray(value.caseIds),
      minimumVoltagePu: finite(value.minimumVoltagePu, defaults.minimumVoltagePu, { minimum: 0.1, maximum: 1.5 }),
      maximumVoltagePu: finite(value.maximumVoltagePu, defaults.maximumVoltagePu, { minimum: 0.1, maximum: 1.5 }),
      maximumLoadingPercent: finite(value.maximumLoadingPercent, defaults.maximumLoadingPercent, { minimum: 1, maximum: 1000 }),
    };
  }

  if (type === "LOADABILITY") {
    const startMultiplier = finite(value.startMultiplier, defaults.startMultiplier, { minimum: 0.01, maximum: 20 });
    const maximumMultiplier = finite(value.maximumMultiplier, defaults.maximumMultiplier, { minimum: startMultiplier, maximum: 100 });
    return {
      selectedComponentIds: stringArray(value.selectedComponentIds),
      startMultiplier,
      maximumMultiplier,
      step: finite(value.step, defaults.step, { minimum: 0.001, maximum: 10 }),
      minimumVoltagePu: finite(value.minimumVoltagePu, defaults.minimumVoltagePu, { minimum: 0.1, maximum: 1.5 }),
      maximumVoltagePu: finite(value.maximumVoltagePu, defaults.maximumVoltagePu, { minimum: 0.1, maximum: 1.5 }),
      maximumLoadingPercent: finite(value.maximumLoadingPercent, defaults.maximumLoadingPercent, { minimum: 1, maximum: 1000 }),
      stopAtFirstViolation: value.stopAtFirstViolation !== false,
    };
  }

  if (type === "DC_POWER_FLOW") {
    return { calculateLineLoading: value.calculateLineLoading !== false };
  }

  return {};
}

export function analysisUnits(analysisType) {
  return getAnalysisDefinition(analysisType).units;
}

export function analysisTypeLabel(analysisType) {
  return getAnalysisDefinition(analysisType).label;
}
