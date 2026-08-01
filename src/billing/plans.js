export const PLAN_CODES = Object.freeze({
  FREE: "FREE",
  BASIC: "BASIC",
});

export const BILLING_PERIODS = Object.freeze({
  MONTHLY: "MONTHLY",
  YEARLY: "YEARLY",
});

export const PLAN_DEFINITIONS = Object.freeze({
  FREE: {
    code: PLAN_CODES.FREE,
    name: "Free",
    description: "Acceso personal para comenzar a crear diagramas.",
    priceLabel: "US$0",
    limits: {
      maxProjects: 3,
      maxComponentsPerProject: 20,
      analysis: {
        standardExecutionEnabled: false,
        advancedExecutionEnabled: false,
        monthlyAnalysisUnits: 0,
        standardMaximumBuses: 0,
        standardMaximumBranches: 0,
        maximumConcurrentStandardStudies: 0,
        maximumConcurrentAdvancedStudies: 0,
        maximumExecutionSeconds: 0,
        resultRetentionDays: 0,
      },
    },
    features: [
      "Proyectos personales",
      "Diagramas eléctricos básicos",
      "Invitaciones y visualización compartida",
    ],
  },
  BASIC: {
    code: PLAN_CODES.BASIC,
    name: "Basic",
    description: "Suscripción inicial para probar el flujo completo de pagos.",
    priceLabel: "US$1/mes",
    limits: {
      maxProjects: 25,
      maxComponentsPerProject: 100,
      analysis: {
        standardExecutionEnabled: true,
        advancedExecutionEnabled: false,
        monthlyAnalysisUnits: 20,
        standardMaximumBuses: 250,
        standardMaximumBranches: 500,
        maximumConcurrentStandardStudies: 1,
        maximumConcurrentAdvancedStudies: 0,
        maximumExecutionSeconds: 300,
        resultRetentionDays: 30,
      },
    },
    features: [
      "Mayor capacidad por proyecto",
      "Historial de cobros",
      "Administración de suscripción",
      "Preparación de estudios eléctricos",
      "20 unidades de análisis mensuales",
      "Gestión y actualización de la suscripción",
    ],
  },
});

export function getPlanDefinition(planCode) {
  return PLAN_DEFINITIONS[planCode] || PLAN_DEFINITIONS.FREE;
}
