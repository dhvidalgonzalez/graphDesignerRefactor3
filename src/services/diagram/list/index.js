import client from "../../api/client/index.js";
import { collectAmplifyPages } from "../../api/helpers/index.js";

export async function listDiagramsByProjectService(projectId) {
  if (!projectId) return [];
  const diagrams = await collectAmplifyPages((nextToken) => client.models.Diagram.listDiagramsByProject({
    projectId,
    limit: 100,
    nextToken,
  }));
  return diagrams.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

export default listDiagramsByProjectService;
