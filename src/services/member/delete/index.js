import client from "../../api/client/index.js";

export async function deleteMemberService(memberId) {
  if (!memberId) return null;
  const result = await client.models.ProjectMember.delete({ id: memberId });
  if (result.errors?.length) throw new Error(result.errors.map((item) => item.message).join("; "));
  return result.data ?? null;
}

export default deleteMemberService;
