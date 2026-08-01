import {
  fetchAuthSession,
  fetchUserAttributes,
  getCurrentUser,
} from "aws-amplify/auth";

function normalizeGroupName(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function readGroups(authSession) {
  const payload = authSession?.tokens?.accessToken?.payload
    ?? authSession?.tokens?.idToken?.payload
    ?? {};
  const raw = payload["cognito:groups"];
  if (Array.isArray(raw)) return raw.map(normalizeGroupName).filter(Boolean);
  if (typeof raw === "string") {
    return raw.split(",").map(normalizeGroupName).filter(Boolean);
  }
  return [];
}

export async function getCurrentSessionService() {
  const [user, attributes, authSession] = await Promise.all([
    getCurrentUser(),
    fetchUserAttributes(),
    fetchAuthSession(),
  ]);
  const userId = attributes.sub || user.userId;
  const username = user.username;
  const email = attributes.email || username;
  const groups = readGroups(authSession);
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
    groups,
    isGlobalAdmin: groups.some((group) => group === "GLOBAL_ADMIN" || group === "GLOBALADMIN"),
  };
}
