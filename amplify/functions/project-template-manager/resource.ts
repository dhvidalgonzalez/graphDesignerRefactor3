import { defineFunction } from "@aws-amplify/backend";

export const projectTemplateManager = defineFunction({
  name: "project-template-manager",
  entry: "./handler.ts",
  timeoutSeconds: 30,
  memoryMB: 1024,
});
