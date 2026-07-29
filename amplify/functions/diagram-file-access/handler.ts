import type {
  AppSyncIdentityCognito,
  AppSyncResolverHandler,
} from "aws-lambda";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/diagram-file-access";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Schema } from "../../data/resource";

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();
const s3 = new S3Client({});

const BUCKET = env.GRAPH_DESIGNER_DOCUMENTS_BUCKET_NAME;
const EXPIRES_SECONDS = 300;

type FileAction = "UPLOAD" | "DOWNLOAD" | "DELETE";

type Arguments = {
  projectId: string;
  diagramId: string;
  action?: string | null;
  contentType?: string | null;
};

type Ticket = {
  url: string;
  key: string;
  method: string;
  expiresAt: string;
  contentType?: string;
};

type RuntimeEvent = {
  fieldName?: string;
  typeName?: string;
};

type Identity = ReturnType<typeof getIdentity>;

function getIdentity(eventIdentity: unknown) {
  const identity = eventIdentity as AppSyncIdentityCognito | null;
  const claims = (identity?.claims ?? {}) as Record<string, unknown>;

  const sub = String(identity?.sub ?? claims.sub ?? "");
  const username = String(
    identity?.username ?? claims.username ?? claims["cognito:username"] ?? "",
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
  identity: Identity,
) {
  const candidates = new Set(
    [
      identity.sub,
      identity.username,
      identity.email,
      identity.identityKey,
    ].filter(Boolean),
  );

  return (values ?? []).some(
    (value) => Boolean(value) && candidates.has(String(value)),
  );
}

function resolveRole(project: Schema["Project"]["type"], identity: Identity) {
  if (includesIdentity(project.ownerIdentities, identity)) return "OWNER";
  if (includesIdentity(project.editorIdentities, identity)) return "EDITOR";
  if (includesIdentity(project.viewerIdentities, identity)) return "VIEWER";

  // Respaldo para proyectos antiguos que todavía no tengan ownerIdentities.
  if (project.ownerProfileId === identity.sub) return "OWNER";

  return null;
}

function parseOptionalAction(
  value: string | null | undefined,
): FileAction | null {
  if (!value) return null;

  const normalized = value.trim().toUpperCase();

  if (
    normalized === "UPLOAD" ||
    normalized === "DOWNLOAD" ||
    normalized === "DELETE"
  ) {
    return normalized;
  }

  throw new Error("UNSUPPORTED_FILE_ACTION");
}

function resolveAction(
  event: RuntimeEvent,
  fallbackAction: string | null | undefined,
): FileAction {
  switch (event.fieldName) {
    case "requestDiagramUpload":
      return "UPLOAD";
    case "requestDiagramDownload":
      return "DOWNLOAD";
    case "deleteDiagramDocument":
      return "DELETE";
    default: {
      const parsed = parseOptionalAction(fallbackAction);
      if (parsed) return parsed;
      throw new Error("UNSUPPORTED_OPERATION");
    }
  }
}

function createExpiresAt() {
  return new Date(Date.now() + EXPIRES_SECONDS * 1000).toISOString();
}

function canWrite(role: string | null) {
  return role === "OWNER" || role === "EDITOR";
}

export const handler: AppSyncResolverHandler<
  Arguments,
  Ticket | boolean
> = async (event) => {
  const runtimeEvent = event as unknown as RuntimeEvent;
  const identity = getIdentity(event.identity);

  if (!identity.sub) {
    throw new Error("UNAUTHENTICATED");
  }

  const { projectId, diagramId } = event.arguments;
  const action = resolveAction(runtimeEvent, event.arguments.action);

  // No registrar el evento completo: contiene el header Authorization.
  console.log("diagram-file-access:request", {
    typeName: runtimeEvent.typeName ?? null,
    fieldName: runtimeEvent.fieldName ?? null,
    action,
    projectId,
    diagramId,
    userSub: identity.sub,
  });

  const projectResult = await client.models.Project.get({
    id: projectId,
  });

  const project = projectResult.data;

  if (projectResult.errors?.length || !project) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  const role = resolveRole(project, identity);

  if (!role) {
    throw new Error("FORBIDDEN");
  }

  const diagramResult = await client.models.Diagram.get({
    id: diagramId,
  });

  const diagram = diagramResult.data;

  if (
    diagramResult.errors?.length ||
    !diagram ||
    diagram.projectId !== projectId
  ) {
    throw new Error("DIAGRAM_NOT_FOUND");
  }

  const expectedKey = `projects/${projectId}/diagrams/${diagramId}/document.json`;

  const key = diagram.storageKey || expectedKey;

  if (key !== expectedKey) {
    throw new Error("DIAGRAM_STORAGE_KEY_MISMATCH");
  }

  if (action === "DOWNLOAD") {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });

    return {
      url: await getSignedUrl(s3, command, {
        expiresIn: EXPIRES_SECONDS,
      }),
      key,
      method: "GET",
      expiresAt: createExpiresAt(),
      contentType: "application/json",
    };
  }

  if (!canWrite(role)) {
    throw new Error("READ_ONLY_PROJECT");
  }

  if (action === "UPLOAD") {
    const contentType =
      event.arguments.contentType?.trim() || "application/json";

    if (contentType !== "application/json") {
      throw new Error("UNSUPPORTED_CONTENT_TYPE");
    }

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
      CacheControl: "no-store",
      Metadata: {
        projectid: projectId,
        diagramid: diagramId,
      },
    });

    return {
      url: await getSignedUrl(s3, command, {
        expiresIn: EXPIRES_SECONDS,
      }),
      key,
      method: "PUT",
      expiresAt: createExpiresAt(),
      contentType,
    };
  }

  await s3.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }),
  );

  return true;
};
