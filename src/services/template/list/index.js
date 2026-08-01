import client from "../../api/client/index.js";
import { unwrapAmplifyResult } from "../../api/helpers/index.js";

export async function listProjectTemplatesService() {
  const templates = unwrapAmplifyResult(
    await client.queries.listProjectTemplates({ action: "LIST" }),
    "No fue posible cargar los ejemplos.",
  );
  return [...templates].sort((a, b) => {
    const featuredDifference = Number(Boolean(b.featured)) - Number(Boolean(a.featured));
    if (featuredDifference) return featuredDifference;
    const positionDifference = Number(a.position ?? 0) - Number(b.position ?? 0);
    if (positionDifference) return positionDifference;
    return String(a.name).localeCompare(String(b.name), "es");
  });
}

export default listProjectTemplatesService;
