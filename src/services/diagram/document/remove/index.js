import client from "../../../api/client/index.js";

export async function removeDiagramDocumentService(projectId, diagramId) {
  const result = await client.mutations.deleteDiagramDocument({
    projectId,
    diagramId,
    action: "DELETE",
  });

  if (result.errors?.length) {
    throw new Error(result.errors.map((item) => item.message).join("; "));
  }

  return Boolean(result.data);
}

export default removeDiagramDocumentService;
