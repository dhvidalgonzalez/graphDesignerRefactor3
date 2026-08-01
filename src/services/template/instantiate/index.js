import client from "../../api/client/index.js";
import { unwrapAmplifyResult } from "../../api/helpers/index.js";

export async function instantiateProjectTemplateService(input) {
  return unwrapAmplifyResult(
    await client.mutations.instantiateProjectTemplate({
      action: "INSTANTIATE",
      templateId: input.templateId,
      workspaceId: input.workspaceId,
      projectName: input.projectName || null,
      clientRequestId: input.clientRequestId,
    }),
    "No fue posible crear una copia del ejemplo.",
  );
}

export default instantiateProjectTemplateService;
