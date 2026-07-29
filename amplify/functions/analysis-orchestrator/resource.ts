import { defineFunction } from "@aws-amplify/backend";

export const analysisOrchestrator = defineFunction({
  name: "analysis-orchestrator",
  entry: "./handler.ts",
  timeoutSeconds: 60,
  memoryMB: 1024,
  environment: {
    ANALYSIS_STORAGE_PREFIX:
      process.env.ANALYSIS_STORAGE_PREFIX ?? "power-flow",
    POWER_FLOW_WORKER_ARN_PARAMETER:
      process.env.POWER_FLOW_WORKER_ARN_PARAMETER ??
      "/gestion-diagrams/dev/analysis/power-flow-worker-arn",
  },
});
