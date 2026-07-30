import { defineFunction } from "@aws-amplify/backend";

const defaultWorkerParameter =
  process.env.ANALYSIS_WORKER_ARN_PARAMETER ??
  process.env.POWER_FLOW_WORKER_ARN_PARAMETER ??
  "/gestion-diagrams/dev/analysis/power-flow-worker-arn";

export const analysisOrchestrator = defineFunction({
  name: "analysis-orchestrator",
  entry: "./handler.ts",
  timeoutSeconds: 60,
  memoryMB: 1024,
  environment: {
    ANALYSIS_STORAGE_PREFIX:
      process.env.ANALYSIS_STORAGE_PREFIX ?? "power-flow",
    ANALYSIS_WORKER_ARN_PARAMETER: defaultWorkerParameter,
    // Se conserva para despliegues antiguos que todavía leen este nombre.
    POWER_FLOW_WORKER_ARN_PARAMETER: defaultWorkerParameter,
  },
});
