import client from "../../api/client/index.js";
import { collectAmplifyPages } from "../../api/helpers/index.js";

export async function listProjectsService() {
  const projects = await collectAmplifyPages((nextToken) => client.models.Project.list({
    limit: 100,
    nextToken,
  }));
  return projects.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export default listProjectsService;
