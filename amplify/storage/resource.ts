import { defineStorage } from "@aws-amplify/backend";
import { diagramFileAccess } from "../functions/diagram-file-access/resource";
import { analysisOrchestrator } from "../functions/analysis-orchestrator/resource";

export const storage = defineStorage({
  name: "graphDesignerDocuments",
  access: (allow) => ({
    "projects/*": [
      // Amplify genera los permisos IAM de las Lambdas y la variable tipada
      // env.GRAPH_DESIGNER_DOCUMENTS_BUCKET_NAME.
      allow.resource(diagramFileAccess).to(["read", "write", "delete"]),
      allow.resource(analysisOrchestrator).to(["read"]),
    ],
    "power-flow/*": [
      allow.resource(analysisOrchestrator).to(["read", "write"]),
    ],
  }),
});
