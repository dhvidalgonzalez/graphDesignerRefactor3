import client from "../../api/client/index.js";
import { identityValues } from "../../api/helpers/index.js";
import getProfileService from "../get/index.js";
import getPersonalWorkspaceService from "../../workspace/getPersonal/index.js";

export async function ensureProfileService(session) {
  let profile = await getProfileService(session.userId);
  const workspaceId = profile?.personalWorkspaceId || `personal-${session.userId}`;

  if (!profile) {
    const profileResult = await client.models.UserProfile.create({
      id: session.userId,
      cognitoId: session.userId,
      profileOwner: session.identityKey,
      email: session.email,
      firstName: session.firstName,
      lastName: session.lastName,
      displayName: session.displayName,
      personalWorkspaceId: workspaceId,
    });
    if (profileResult.errors?.length || !profileResult.data) {
      throw new Error(profileResult.errors?.map((item) => item.message).join("; ") || "No se pudo crear el perfil.");
    }
    profile = profileResult.data;
  }

  let workspace = await getPersonalWorkspaceService(workspaceId);
  if (!workspace) {
    const workspaceResult = await client.models.Workspace.create({
      id: workspaceId,
      name: `Espacio de ${profile.displayName}`,
      description: "Espacio de trabajo personal",
      type: "PERSONAL",
      ownerProfileId: profile.id,
      ownerIdentity: session.userId,
      ownerIdentities: identityValues(session),
      projectCount: 0,
      memberCount: 1,
    });
    if (workspaceResult.errors?.length || !workspaceResult.data) {
      throw new Error(workspaceResult.errors?.map((item) => item.message).join("; ") || "No se pudo crear el espacio personal.");
    }
    workspace = workspaceResult.data;
  }

  return { profile, workspace };
}

export default ensureProfileService;
