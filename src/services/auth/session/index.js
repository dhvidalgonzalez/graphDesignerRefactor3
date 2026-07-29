import { fetchUserAttributes, getCurrentUser } from "aws-amplify/auth";

export async function getCurrentSessionService() {
  const [user, attributes] = await Promise.all([
    getCurrentUser(),
    fetchUserAttributes(),
  ]);
  const userId = attributes.sub || user.userId;
  const username = user.username;
  const email = attributes.email || username;
  return {
    user,
    attributes,
    userId,
    username,
    email,
    identityKey: `${userId}::${username}`,
    firstName: attributes.given_name || "",
    lastName: attributes.family_name || "",
    displayName: `${attributes.given_name || ""} ${attributes.family_name || ""}`.trim() || email,
  };
}
