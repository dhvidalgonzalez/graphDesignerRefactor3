import client from "../../api/client/index.js";

export async function syncProjectDiagramsService(projectId, activeDiagramId = null) {
  if (!projectId) throw new Error("Se requiere el identificador del proyecto.");
  const result = await client.mutations.syncProjectDiagrams({
    projectId,
    ...(activeDiagramId ? { activeDiagramId } : {}),
  });
  if (result.errors?.length) throw new Error(result.errors.map((item) => item.message).join("; "));
  return Boolean(result.data);
}

export default syncProjectDiagramsService;
