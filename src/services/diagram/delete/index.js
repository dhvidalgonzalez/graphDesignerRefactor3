import client from "../../api/client/index.js";

export async function deleteDiagramService(diagramId) {
  const result = await client.models.Diagram.delete({ id: diagramId });
  if (result.errors?.length) throw new Error(result.errors.map((item) => item.message).join("; "));
  return result.data ?? null;
}

export default deleteDiagramService;
