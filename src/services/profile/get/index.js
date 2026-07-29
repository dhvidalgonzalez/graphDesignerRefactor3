import client from "../../api/client/index.js";
import { unwrapAmplifyResult } from "../../api/helpers/index.js";

export async function getProfileService(profileId) {
  if (!profileId) throw new Error("Se requiere el identificador del perfil.");
  const result = await client.models.UserProfile.get({ id: profileId });
  if (result.errors?.length) return unwrapAmplifyResult(result, "No fue posible obtener el perfil.");
  return result.data ?? null;
}

export default getProfileService;
