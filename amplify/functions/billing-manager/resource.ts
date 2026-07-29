import { defineFunction, secret } from "@aws-amplify/backend";

export const billingManager = defineFunction({
  name: "billing-manager",
  entry: "./handler.ts",
  timeoutSeconds: 30,
  memoryMB: 512,
  environment: {
    APP_URL: "https://main.d2rwh2roc6g1d0.amplifyapp.com/",
    LEMON_SQUEEZY_API_KEY: secret("LEMON_SQUEEZY_API_KEY"),
    LEMON_SQUEEZY_STORE_ID: secret("LEMON_SQUEEZY_STORE_ID"),
    LEMON_SQUEEZY_BASIC_MONTHLY_VARIANT_ID: secret(
      "LEMON_SQUEEZY_BASIC_MONTHLY_VARIANT_ID",
    ),
    LEMON_SQUEEZY_BASIC_YEARLY_VARIANT_ID: secret(
      "LEMON_SQUEEZY_BASIC_YEARLY_VARIANT_ID",
    ),
  },
});
