import client from "../../api/client/index.js";
import { unwrapAmplifyResult } from "../../api/helpers/index.js";

export async function createMemberService(input) {
  return unwrapAmplifyResult(
    await client.models.ProjectMember.create(input),
    "No fue posible registrar al integrante del proyecto.",
  );
}

export default createMemberService;
