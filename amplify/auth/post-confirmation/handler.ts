import type { PostConfirmationTriggerHandler } from "aws-lambda";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/post-confirmation";
import type { Schema } from "../../data/resource";

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();

function identityValue(sub: string, username: string) {
  return `${sub}::${username}`;
}

export const handler: PostConfirmationTriggerHandler = async (event) => {
  const attributes = event.request.userAttributes;
  const sub = attributes.sub;
  const email = attributes.email ?? event.userName;
  if (!sub) throw new Error("El usuario confirmado no contiene el atributo sub.");
  const firstName = attributes.given_name ?? "";
  const lastName = attributes.family_name ?? "";
  const displayName = `${firstName} ${lastName}`.trim() || email;
  const profileOwner = identityValue(sub, event.userName);
  const workspaceId = `personal-${sub}`;

  const existingProfile = await client.models.UserProfile.get({ id: sub });
  if (!existingProfile.data) {
    const profileResult = await client.models.UserProfile.create({
      id: sub,
      cognitoId: sub,
      profileOwner,
      email,
      firstName,
      lastName,
      displayName,
      personalWorkspaceId: workspaceId,
    });
    if (profileResult.errors?.length) {
      console.error("No se pudo crear el perfil", profileResult.errors);
      throw new Error("No se pudo crear el perfil de usuario.");
    }
  }

  const existingWorkspace = await client.models.Workspace.get({ id: workspaceId });
  if (!existingWorkspace.data) {
    const workspaceResult = await client.models.Workspace.create({
      id: workspaceId,
      name: `Espacio de ${displayName}`,
      description: "Espacio de trabajo personal",
      type: "PERSONAL",
      ownerProfileId: sub,
      ownerIdentity: sub,
      ownerIdentities: [sub, profileOwner, event.userName, email],
      projectCount: 0,
      memberCount: 1,
    });
    if (workspaceResult.errors?.length) {
      console.error("No se pudo crear el espacio personal", workspaceResult.errors);
      throw new Error("No se pudo crear el espacio de trabajo personal.");
    }
  }

  return event;
};
