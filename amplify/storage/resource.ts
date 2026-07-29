import { defineStorage } from "@aws-amplify/backend";
import { diagramFileAccess } from "../functions/diagram-file-access/resource";

export const storage = defineStorage({
  name: "graphDesignerDocuments",
  access: (allow) => ({
    "projects/*": [
      // Amplify genera los permisos IAM de la Lambda y la variable tipada
      // env.GRAPH_DESIGNER_DOCUMENTS_BUCKET_NAME.
      allow.resource(diagramFileAccess).to(["read", "write", "delete"]),
    ],
  }),
});
