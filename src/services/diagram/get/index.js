import client from "../../api/client/index.js";
import { unwrapAmplifyResult } from "../../api/helpers/index.js";

export async function getDiagramService(diagramId) {
  if (!diagramId) throw new Error("Se requiere el identificador del diagrama.");
  return unwrapAmplifyResult(
    await client.models.Diagram.get({ id: diagramId }),
    "No fue posible cargar los metadatos del diagrama.",
  );
}

export default getDiagramService;
