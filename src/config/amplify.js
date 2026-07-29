import { Amplify } from "aws-amplify";
import outputs from "../../amplify_outputs.json";

let configured = false;

export function configureAmplify() {
  if (configured) return;
  Amplify.configure(outputs);
  configured = true;
}

export function hasAmplifyOutputs() {
  return Boolean(outputs?.auth?.user_pool_id && outputs?.data?.url);
}
