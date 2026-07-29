import { defineFunction } from "@aws-amplify/backend";

export const diagramFileAccess = defineFunction({
  name: "diagram-file-access",
  entry: "./handler.ts",
  timeoutSeconds: 20,
  memoryMB: 512,
});
