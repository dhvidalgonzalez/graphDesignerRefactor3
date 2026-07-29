import client from "../../api/client/index.js";
import { unwrapAmplifyResult } from "../../api/helpers/index.js";

export async function updateWorkspaceService(input) {
  if (!input?.id) throw new Error("Se requiere el identificador del espacio de trabajo.");
  return unwrapAmplifyResult(
    await client.models.Workspace.update(input),
    "No fue posible actualizar el espacio de trabajo.",
  );
}

export default updateWorkspaceService;
