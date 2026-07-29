import client from "../../api/client/index.js";

export async function acceptInvitationService(invitationId) {
  const result = await client.mutations.acceptProjectInvitation({ invitationId });
  if (result.errors?.length) throw new Error(result.errors.map((item) => item.message).join("; "));
  return Boolean(result.data);
}

export default acceptInvitationService;
