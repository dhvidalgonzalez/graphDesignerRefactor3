import client from "../../api/client/index.js";
import { unwrapAmplifyResult } from "../../api/helpers/index.js";

export async function createProjectService(input) {
  return unwrapAmplifyResult(
    await client.models.Project.create(input),
    "No fue posible crear el proyecto.",
  );
}

export default createProjectService;
