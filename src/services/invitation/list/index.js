import client from "../../api/client/index.js";
import { collectAmplifyPages } from "../../api/helpers/index.js";

export async function listInvitationsByProjectService(projectId) {
  if (!projectId) return [];
  return collectAmplifyPages((nextToken) =>
    client.models.ProjectInvitation.listInvitationsByProject(
      { projectId },
      { limit: 100, nextToken },
    ),
  );
}

export async function listMyInvitationsService(email) {
  if (!email) return [];
  return collectAmplifyPages((nextToken) =>
    client.models.ProjectInvitation.listInvitationsByEmail(
      { email: email.toLowerCase() },
      { limit: 100, nextToken },
    ),
  );
}
