import { defineFunction, secret } from "@aws-amplify/backend";

export const lemonSqueezyWebhook = defineFunction({
  name: "lemon-squeezy-webhook",
  entry: "./handler.ts",
  timeoutSeconds: 20,
  memoryMB: 512,
  environment: {
    LEMON_SQUEEZY_WEBHOOK_SECRET: secret("LEMON_SQUEEZY_WEBHOOK_SECRET"),
    LEMON_SQUEEZY_BASIC_MONTHLY_VARIANT_ID: secret(
      "LEMON_SQUEEZY_BASIC_MONTHLY_VARIANT_ID",
    ),
    LEMON_SQUEEZY_BASIC_YEARLY_VARIANT_ID: secret(
      "LEMON_SQUEEZY_BASIC_YEARLY_VARIANT_ID",
    ),
  },
});
