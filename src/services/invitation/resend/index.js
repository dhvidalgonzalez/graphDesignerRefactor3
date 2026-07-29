import client from "../../api/client/index.js";

export async function resendInvitationService(invitationId) {
  if (!invitationId) throw new Error("Se requiere la invitación que se quiere reenviar.");

  const result = await client.mutations.resendProjectInvitation({ invitationId });

  if (result.errors?.length || !result.data) {
    throw new Error(
      result.errors?.map((item) => item.message).join("; ") ||
        "No fue posible reenviar la invitación.",
    );
  }

  return {
    ...result.data,
    id: result.data.invitationId,
  };
}

export default resendInvitationService;
