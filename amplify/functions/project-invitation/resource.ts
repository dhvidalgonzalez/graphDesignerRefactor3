import { defineFunction } from "@aws-amplify/backend";

export const projectInvitation = defineFunction({
  name: "project-invitation",
  entry: "./handler.ts",
  timeoutSeconds: 30,
  memoryMB: 512,
  environment: {
    APP_NAME: "Graph Designer",
    APP_URL: "https://main.d9mpwl87qc50k.amplifyapp.com",
    SES_FROM_EMAIL: "dhvidalgonzalez@gmail.com",
  },
});
