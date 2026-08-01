import client from "../../api/client/index.js";
import { unwrapAmplifyResult } from "../../api/helpers/index.js";

export async function publishProjectTemplateService(input) {
  return unwrapAmplifyResult(
    await client.mutations.publishProjectTemplate({
      action: "PUBLISH",
      sourceProjectId: input.sourceProjectId,
      templateId: input.templateId || null,
      name: input.name,
      description: input.description ?? null,
      category: input.category ?? null,
      featured: Boolean(input.featured),
    }),
    "No fue posible publicar el ejemplo.",
  );
}

export default publishProjectTemplateService;
