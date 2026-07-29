import type {
  AppSyncIdentityCognito,
  AppSyncResolverHandler,
} from "aws-lambda";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/project-diagram-sync";
import type { Schema } from "../../data/resource";

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();

type Arguments = {
  projectId: string;
  activeDiagramId?: string | null;
};

function getIdentity(eventIdentity: unknown) {
  const identity = eventIdentity as AppSyncIdentityCognito | null;
  const claims = (identity?.claims ?? {}) as Record<string, unknown>;
  const sub = String(claims.sub ?? "");
  const username = String(
    identity?.username ?? claims["cognito:username"] ?? "",
  );
  return {
    sub,
    username,
    email: String(claims.email ?? "").toLowerCase(),
    identityKey: sub && username ? `${sub}::${username}` : "",
  };
}

function includesIdentity(
  values: readonly (string | null)[] | null | undefined,
  identity: ReturnType<typeof getIdentity>,
) {
  const candidates = new Set(
    [
      identity.sub,
      identity.username,
      identity.email,
      identity.identityKey,
    ].filter(Boolean),
  );
  return (values ?? []).some((value) =>
    Boolean(value && candidates.has(value)),
  );
}

export const handler: AppSyncResolverHandler<Arguments, boolean> = async (
  event,
) => {
  const identity = getIdentity(event.identity);
  if (!identity.sub) throw new Error("UNAUTHENTICATED");

  const projectResult = await client.models.Project.get({
    id: event.arguments.projectId,
  });
  const project = projectResult.data;
  if (projectResult.errors?.length || !project)
    throw new Error("PROJECT_NOT_FOUND");

  const canEdit =
    includesIdentity(project.ownerIdentities, identity) ||
    includesIdentity(project.editorIdentities, identity);
  if (!canEdit) throw new Error("WRITE_ACCESS_REQUIRED");

  const diagrams: Array<Schema["Diagram"]["type"]> = [];
  let nextToken: string | null | undefined;
  do {
    const page = await client.models.Diagram.listDiagramsByProject(
      { projectId: project.id },
      { limit: 100, nextToken },
    );
    if (page.errors?.length) throw new Error("DIAGRAM_LIST_FAILED");
    diagrams.push(
      ...page.data.filter((diagram) => diagram.status !== "ARCHIVED"),
    );
    nextToken = page.nextToken;
  } while (nextToken);

  diagrams.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const requestedId =
    event.arguments.activeDiagramId ?? project.activeDiagramId;
  const activeDiagramId = diagrams.some((diagram) => diagram.id === requestedId)
    ? requestedId
    : (diagrams[0]?.id ?? null);

  const updateResult = await client.models.Project.update({
    id: project.id,
    activeDiagramId,
    diagramCount: diagrams.length,
  });
  if (updateResult.errors?.length || !updateResult.data) {
    throw new Error("PROJECT_SUMMARY_UPDATE_FAILED");
  }

  return true;
};
