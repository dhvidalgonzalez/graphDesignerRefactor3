import client from "../../api/client/index.js";
import { unwrapAmplifyResult } from "../../api/helpers/index.js";

export async function updateDiagramService(input) {
  if (!input?.id) throw new Error("Se requiere el identificador del diagrama.");
  return unwrapAmplifyResult(
    await client.models.Diagram.update(input),
    "No fue posible actualizar el diagrama.",
  );
}

export default updateDiagramService;
