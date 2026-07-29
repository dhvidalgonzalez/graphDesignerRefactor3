import client from "../../api/client/index.js";

export async function deleteInvitationService(invitationId) {
  if (!invitationId) return null;
  const result = await client.models.ProjectInvitation.delete({ id: invitationId });
  if (result.errors?.length) throw new Error(result.errors.map((item) => item.message).join("; "));
  return result.data ?? null;
}

export default deleteInvitationService;
