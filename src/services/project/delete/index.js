import client from "../../api/client/index.js";

export async function deleteProjectService(projectId) {
  if (!projectId) throw new Error("Se requiere el identificador del proyecto.");
  const result = await client.models.Project.delete({ id: projectId });
  if (result.errors?.length) throw new Error(result.errors.map((item) => item.message).join("; "));
  return result.data ?? null;
}

export default deleteProjectService;
