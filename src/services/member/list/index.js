import client from "../../api/client/index.js";
import { collectAmplifyPages } from "../../api/helpers/index.js";

export async function listMembersByProjectService(projectId) {
  if (!projectId) return [];
  return collectAmplifyPages((nextToken) => client.models.ProjectMember.listMembersByProject({
    projectId,
    limit: 100,
    nextToken,
  }));
}

export default listMembersByProjectService;
