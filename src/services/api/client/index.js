import { generateClient } from "aws-amplify/data";

/** Cliente Amplify Data único para toda la aplicación. */
export const amplifyClient = generateClient({ authMode: "userPool" });

export default amplifyClient;
