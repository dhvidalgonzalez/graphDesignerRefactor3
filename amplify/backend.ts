import { defineBackend } from "@aws-amplify/backend";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { CfnOutput, Stack } from "aws-cdk-lib";
import { FunctionUrlAuthType } from "aws-cdk-lib/aws-lambda";
import { auth } from "./auth/resource";
import { postConfirmation } from "./auth/post-confirmation/resource";
import { data } from "./data/resource";
import { storage } from "./storage/resource";
import { diagramFileAccess } from "./functions/diagram-file-access/resource";
import { projectInvitation } from "./functions/project-invitation/resource";
import { projectDiagramSync } from "./functions/project-diagram-sync/resource";
import { billingManager } from "./functions/billing-manager/resource";
import { lemonSqueezyWebhook } from "./functions/lemon-squeezy-webhook/resource";
import { analysisOrchestrator } from "./functions/analysis-orchestrator/resource";
import { projectTemplateManager } from "./functions/project-template-manager/resource";

export const backend = defineBackend({
  auth,
  postConfirmation,
  data,
  storage,
  diagramFileAccess,
  projectInvitation,
  projectDiagramSync,
  billingManager,
  lemonSqueezyWebhook,
  analysisOrchestrator,
  projectTemplateManager,
});

backend.projectInvitation.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["ses:SendEmail"],
    resources: ["*"],
  }),
);

const billingWebhookUrl =
  backend.lemonSqueezyWebhook.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });

new CfnOutput(
  backend.lemonSqueezyWebhook.resources.lambda.stack,
  "LemonSqueezyWebhookUrl",
  { value: billingWebhookUrl.url },
);

const analysisStack = Stack.of(
  backend.analysisOrchestrator.resources.lambda,
);

backend.analysisOrchestrator.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["ssm:GetParameter"],
    resources: [
      `arn:${analysisStack.partition}:ssm:${analysisStack.region}:${analysisStack.account}:parameter/gestion-diagrams/*/analysis/*worker-arn`,
    ],
  }),
);

backend.analysisOrchestrator.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["lambda:InvokeFunction"],
    resources: [
      `arn:${analysisStack.partition}:lambda:${analysisStack.region}:${analysisStack.account}:function:gestion-power-flow-solver-*-*worker`,
    ],
  }),
);
