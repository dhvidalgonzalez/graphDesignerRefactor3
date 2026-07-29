import client from "../../api/client/index.js";

export async function getPersonalWorkspaceService(workspaceId) {
  if (!workspaceId) return null;
  const result = await client.models.Workspace.get({ id: workspaceId });
  if (result.errors?.length) throw new Error(result.errors.map((item) => item.message).join("; "));
  return result.data ?? null;
}

export default getPersonalWorkspaceService;
