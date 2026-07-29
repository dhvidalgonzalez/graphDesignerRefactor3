import { defineFunction } from "@aws-amplify/backend";

export const projectDiagramSync = defineFunction({
  name: "project-diagram-sync",
  entry: "./handler.ts",
  timeoutSeconds: 20,
  memoryMB: 512,
});
