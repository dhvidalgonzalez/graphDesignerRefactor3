import { defineBackend } from "@aws-amplify/backend";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { CfnOutput } from "aws-cdk-lib";
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
