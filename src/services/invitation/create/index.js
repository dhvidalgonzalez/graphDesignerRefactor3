import client from "../../api/client/index.js";

function normalizeDelivery(data) {
  if (!data) return null;
  return {
    ...data,
    id: data.invitationId,
  };
}

export async function createInvitationService({ projectId, email, role }) {
  const result = await client.mutations.sendProjectInvitation({
    projectId,
    email: String(email || "").trim().toLowerCase(),
    role: String(role || "VIEWER").toUpperCase(),
  });

  if (result.errors?.length || !result.data) {
    throw new Error(
      result.errors?.map((item) => item.message).join("; ") ||
        "No fue posible crear y enviar la invitación.",
    );
  }

  return normalizeDelivery(result.data);
}

export default createInvitationService;
