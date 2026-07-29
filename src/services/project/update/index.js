import client from "../../api/client/index.js";
import { unwrapAmplifyResult } from "../../api/helpers/index.js";

export async function updateProjectService(input) {
  if (!input?.id) throw new Error("Se requiere el identificador del proyecto.");
  return unwrapAmplifyResult(
    await client.models.Project.update(input),
    "No fue posible actualizar el proyecto.",
  );
}

export default updateProjectService;
