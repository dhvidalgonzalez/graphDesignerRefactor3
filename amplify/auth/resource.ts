import { defineAuth } from "@aws-amplify/backend";
import { postConfirmation } from "./post-confirmation/resource";

export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  groups: ["GLOBAL_ADMIN"],
  multifactor: {
    mode: "OPTIONAL",
    totp: true,
  },
  userAttributes: {
    givenName: {
      mutable: true,
      required: false,
    },
    familyName: {
      mutable: true,
      required: false,
    },
  },
  triggers: {
    postConfirmation,
  },
});
