import client from "../../api/client/index.js";
import { unwrapAmplifyResult } from "../../api/helpers/index.js";

export async function createDiagramService(input) {
  return unwrapAmplifyResult(
    await client.models.Diagram.create(input),
    "No fue posible crear el diagrama.",
  );
}

export default createDiagramService;
