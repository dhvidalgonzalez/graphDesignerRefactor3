import type {
  AppSyncIdentityCognito,
  AppSyncResolverHandler,
} from "aws-lambda";
import { createHash, randomUUID } from "node:crypto";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "$amplify/env/project-template-manager";
import type { Schema } from "../../data/resource";

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();
const s3 = new S3Client({});
const BUCKET = env.GRAPH_DESIGNER_DOCUMENTS_BUCKET_NAME;

const TEMPLATE_SCHEMA_VERSION = 1;

type TemplateAction = "LIST" | "PUBLISH" | "INSTANTIATE";

type Arguments = {
  action?: string | null;
  sourceProjectId?: string | null;
  templateId?: string | null;
  workspaceId?: string | null;
  projectName?: string | null;
  clientRequestId?: string | null;
  name?: string | null;
  description?: string | null;
  category?: string | null;
  featured?: boolean | null;
};

type TemplateSummary = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  status: string;
  featured: boolean;
  position: number;
  diagramCount: number;
  componentCount: number;
  multiDiagram: boolean;
  updatedAt?: string | null;
};

type InstantiationResult = {
  projectId: string;
  activeDiagramId: string;
  templateId: string;
  projectName: string;
};

type TemplateBundleDiagram = {
  ref: string;
  name: string;
  description?: string;
  position: number;
  document: Record<string, unknown>;
};

type TemplateBundle = {
  schemaVersion: number;
  templateId: string;
  generatedAt: string;
  project: {
    name: string;
    description?: string;
    multiDiagram: boolean;
    activeDiagramRef: string;
  };
  diagrams: TemplateBundleDiagram[];
};

type HandlerResult =
  | TemplateSummary[]
  | TemplateSummary
  | InstantiationResult;

type RuntimeEvent = {
  fieldName?: string;
  info?: { fieldName?: string };
};

function normalizeGroupName(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function getGroups(claims: Record<string, unknown>) {
  const raw = claims["cognito:groups"];
  if (Array.isArray(raw)) return raw.map(normalizeGroupName).filter(Boolean);
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map(normalizeGroupName)
      .filter(Boolean);
  }
  return [];
}

function getIdentity(eventIdentity: unknown) {
  const identity = eventIdentity as AppSyncIdentityCognito | null;
  const claims = (identity?.claims ?? {}) as Record<string, unknown>;
  const sub = String(identity?.sub ?? claims.sub ?? "");
  const username = String(
    identity?.username ??
      claims.username ??
      claims["cognito:username"] ??
      "",
  );
  const email = String(claims.email ?? "").trim().toLowerCase();

  return {
    sub,
    username,
    email,
    identityKey: sub && username ? `${sub}::${username}` : "",
    groups: getGroups(claims),
  };
}

type Identity = ReturnType<typeof getIdentity>;

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function identityValues(identity: Identity) {
  return unique([
    identity.sub,
    identity.username,
    identity.email,
    identity.identityKey,
  ]);
}

function includesIdentity(
  values: readonly (string | null)[] | null | undefined,
  identity: Identity,
) {
  const candidates = new Set(identityValues(identity));
  return (values ?? []).some(
    (value) => Boolean(value) && candidates.has(String(value)),
  );
}

function isGlobalAdmin(identity: Identity) {
  return identity.groups.some(
    (group) => group === "GLOBAL_ADMIN" || group === "GLOBALADMIN",
  );
}

function requireText(value: string | null | undefined, code: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function resolveAction(event: RuntimeEvent, fallback?: string | null): TemplateAction {
  const fieldName = event.info?.fieldName ?? event.fieldName;
  const fieldAction = (() => {
    switch (fieldName) {
      case "listProjectTemplates":
        return "LIST";
      case "publishProjectTemplate":
        return "PUBLISH";
      case "instantiateProjectTemplate":
        return "INSTANTIATE";
      default:
        return null;
    }
  })();

  const normalized = String(fallback ?? fieldAction ?? "")
    .trim()
    .toUpperCase();

  if (
    normalized === "LIST" ||
    normalized === "PUBLISH" ||
    normalized === "INSTANTIATE"
  ) {
    return normalized;
  }

  throw new Error("UNSUPPORTED_TEMPLATE_OPERATION");
}

function toTemplateSummary(
  template: Schema["ProjectTemplate"]["type"],
): TemplateSummary {
  return {
    id: template.id,
    name: template.name,
    description: template.description ?? null,
    category: template.category ?? null,
    status: String(template.status),
    featured: Boolean(template.featured),
    position: Number(template.position ?? 0),
    diagramCount: Number(template.diagramCount ?? 0),
    componentCount: Number(template.componentCount ?? 0),
    multiDiagram: Boolean(template.multiDiagram),
    updatedAt: template.updatedAt ?? null,
  };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function projectIdForRequest(identity: Identity, requestId: string) {
  return `project-${sha256(`${identity.sub}:${requestId}`).slice(0, 24)}`;
}

function diagramIdForRef(projectId: string, ref: string) {
  return `diagram-${sha256(`${projectId}:${ref}`).slice(0, 24)}`;
}

function templateBundleKey(templateId: string) {
  return `templates/${templateId}/bundle.json`;
}

function expectedDiagramKey(projectId: string, diagramId: string) {
  return `projects/${projectId}/diagrams/${diagramId}/document.json`;
}

async function listAllTemplates() {
  const templates: Schema["ProjectTemplate"]["type"][] = [];
  let nextToken: string | null | undefined;

  do {
    const page = await client.models.ProjectTemplate.list({
      limit: 100,
      nextToken,
    });
    if (page.errors?.length) throw new Error("TEMPLATE_LIST_FAILED");
    templates.push(...page.data);
    nextToken = page.nextToken;
  } while (nextToken);

  return templates;
}

async function listProjectDiagrams(projectId: string) {
  const diagrams: Schema["Diagram"]["type"][] = [];
  let nextToken: string | null | undefined;

  do {
    const page = await client.models.Diagram.listDiagramsByProject(
      { projectId },
      { limit: 100, nextToken },
    );
    if (page.errors?.length) throw new Error("DIAGRAM_LIST_FAILED");
    diagrams.push(...page.data.filter((diagram) => diagram.status !== "ARCHIVED"));
    nextToken = page.nextToken;
  } while (nextToken);

  return diagrams.sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
}

async function listProjectMembers(projectId: string) {
  const members: Schema["ProjectMember"]["type"][] = [];
  let nextToken: string | null | undefined;

  do {
    const page = await client.models.ProjectMember.listMembersByProject(
      { projectId },
      { limit: 100, nextToken },
    );
    if (page.errors?.length) throw new Error("PROJECT_MEMBER_LIST_FAILED");
    members.push(...page.data);
    nextToken = page.nextToken;
  } while (nextToken);

  return members;
}

async function readJsonObject(key: string) {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }),
  );
  const text = await response.Body?.transformToString("utf-8");
  if (!text) throw new Error("EMPTY_TEMPLATE_DOCUMENT");
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("INVALID_TEMPLATE_DOCUMENT");
  }
  return parsed as Record<string, unknown>;
}

async function readTemplateBundle(key: string) {
  const bundle = (await readJsonObject(key)) as unknown as TemplateBundle;
  if (
    bundle.schemaVersion !== TEMPLATE_SCHEMA_VERSION ||
    !bundle.project ||
    !Array.isArray(bundle.diagrams) ||
    bundle.diagrams.length === 0
  ) {
    throw new Error("INVALID_TEMPLATE_BUNDLE");
  }
  return bundle;
}

async function putJson(key: string, value: unknown, metadata?: Record<string, string>) {
  const body = JSON.stringify(value);
  const checksum = sha256(body);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: "application/json",
      CacheControl: "no-store",
      Metadata: metadata,
    }),
  );
  return {
    documentBytes: Buffer.byteLength(body, "utf-8"),
    documentChecksum: checksum,
  };
}

function remapStringValues(value: unknown, replacements: Map<string, string>): unknown {
  if (typeof value === "string") return replacements.get(value) ?? value;
  if (Array.isArray(value)) {
    return value.map((item) => remapStringValues(item, replacements));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        remapStringValues(item, replacements),
      ]),
    );
  }
  return value;
}

async function cleanupProject(projectId: string) {
  const diagrams = await listProjectDiagrams(projectId).catch(() => []);
  const members = await listProjectMembers(projectId).catch(() => []);

  for (const diagram of diagrams) {
    const key = diagram.storageKey || expectedDiagramKey(projectId, diagram.id);
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    } catch {
      // Limpieza por mejor esfuerzo.
    }
    try {
      await client.models.Diagram.delete({ id: diagram.id });
    } catch {
      // Limpieza por mejor esfuerzo.
    }
  }

  for (const member of members) {
    try {
      await client.models.ProjectMember.delete({ id: member.id });
    } catch {
      // Limpieza por mejor esfuerzo.
    }
  }

  try {
    await client.models.Project.delete({ id: projectId });
  } catch {
    // Limpieza por mejor esfuerzo.
  }
}

async function listTemplates(): Promise<TemplateSummary[]> {
  const templates = await listAllTemplates();
  return templates
    .filter((template) => template.status === "PUBLISHED")
    .sort((a, b) => {
      const featuredDifference = Number(Boolean(b.featured)) - Number(Boolean(a.featured));
      if (featuredDifference) return featuredDifference;
      const positionDifference = Number(a.position ?? 0) - Number(b.position ?? 0);
      if (positionDifference) return positionDifference;
      return String(a.name).localeCompare(String(b.name), "es");
    })
    .map(toTemplateSummary);
}

async function publishTemplate(
  args: Arguments,
  identity: Identity,
): Promise<TemplateSummary> {
  if (!isGlobalAdmin(identity)) throw new Error("GLOBAL_ADMIN_REQUIRED");

  const sourceProjectId = requireText(
    args.sourceProjectId,
    "SOURCE_PROJECT_ID_REQUIRED",
  );
  const projectResult = await client.models.Project.get({ id: sourceProjectId });
  const project = projectResult.data;

  if (projectResult.errors?.length || !project) {
    throw new Error("SOURCE_PROJECT_NOT_FOUND");
  }

  const ownsProject =
    includesIdentity(project.ownerIdentities, identity) ||
    project.ownerProfileId === identity.sub;
  if (!ownsProject) throw new Error("SOURCE_PROJECT_OWNER_REQUIRED");
  if (project.status !== "ACTIVE") throw new Error("SOURCE_PROJECT_NOT_ACTIVE");

  const diagrams = await listProjectDiagrams(project.id);
  if (!diagrams.length) throw new Error("SOURCE_PROJECT_HAS_NO_DIAGRAMS");

  const bundleDiagrams: TemplateBundleDiagram[] = [];
  let componentCount = 0;

  for (const diagram of diagrams) {
    const expectedKey = expectedDiagramKey(project.id, diagram.id);
    const key = diagram.storageKey || expectedKey;
    if (key !== expectedKey) throw new Error("DIAGRAM_STORAGE_KEY_MISMATCH");
    const document = await readJsonObject(key);
    componentCount += Object.keys(
      (document.nodes as Record<string, unknown> | undefined) ?? {},
    ).length;
    bundleDiagrams.push({
      ref: diagram.id,
      name: diagram.name,
      description: diagram.description ?? "",
      position: Number(diagram.position ?? 0),
      document,
    });
  }

  const requestedTemplateId = normalizeOptionalText(args.templateId);
  const linkedTemplateId = project.publishedTemplateId ?? null;
  const templateId = requestedTemplateId || linkedTemplateId || `template-${randomUUID()}`;
  const existingResult = await client.models.ProjectTemplate.get({ id: templateId });
  const existing = existingResult.data;
  if (existingResult.errors?.length) throw new Error("TEMPLATE_LOOKUP_FAILED");
  if (existing && existing.sourceProjectId !== project.id) {
    throw new Error("TEMPLATE_SOURCE_PROJECT_MISMATCH");
  }

  const name = requireText(args.name ?? project.name, "TEMPLATE_NAME_REQUIRED");
  const description = normalizeOptionalText(args.description);
  const category = normalizeOptionalText(args.category);
  const activeDiagramRef = diagrams.some((diagram) => diagram.id === project.activeDiagramId)
    ? String(project.activeDiagramId)
    : diagrams[0].id;
  const bundleKey = templateBundleKey(templateId);
  const now = new Date().toISOString();
  const bundle: TemplateBundle = {
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    templateId,
    generatedAt: now,
    project: {
      name,
      description: description ?? "",
      multiDiagram: Boolean(project.multiDiagram),
      activeDiagramRef,
    },
    diagrams: bundleDiagrams,
  };

  await putJson(bundleKey, bundle, {
    templateid: templateId,
    sourceprojectid: project.id,
  });

  const templateInput = {
    id: templateId,
    name,
    description,
    category,
    status: "PUBLISHED" as const,
    bundleKey,
    sourceProjectId: project.id,
    createdByIdentity: existing?.createdByIdentity || identity.identityKey || identity.sub,
    updatedByIdentity: identity.identityKey || identity.sub,
    featured: args.featured ?? existing?.featured ?? false,
    position: existing?.position ?? 0,
    diagramCount: diagrams.length,
    componentCount,
    multiDiagram: Boolean(project.multiDiagram),
  };

  const templateResult = existing
    ? await client.models.ProjectTemplate.update(templateInput)
    : await client.models.ProjectTemplate.create(templateInput);

  if (templateResult.errors?.length || !templateResult.data) {
    if (!existing) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: bundleKey }));
      } catch {
        // Limpieza por mejor esfuerzo.
      }
    }
    throw new Error(existing ? "TEMPLATE_UPDATE_FAILED" : "TEMPLATE_CREATE_FAILED");
  }

  if (project.publishedTemplateId !== templateId) {
    const updateProjectResult = await client.models.Project.update({
      id: project.id,
      publishedTemplateId: templateId,
    });
    if (updateProjectResult.errors?.length || !updateProjectResult.data) {
      throw new Error("SOURCE_PROJECT_TEMPLATE_LINK_FAILED");
    }
  }

  return toTemplateSummary(templateResult.data);
}

async function instantiateTemplate(
  args: Arguments,
  identity: Identity,
): Promise<InstantiationResult> {
  const templateId = requireText(args.templateId, "TEMPLATE_ID_REQUIRED");
  const workspaceId = requireText(args.workspaceId, "WORKSPACE_ID_REQUIRED");
  const requestId = requireText(args.clientRequestId, "CLIENT_REQUEST_ID_REQUIRED");

  const [templateResult, workspaceResult] = await Promise.all([
    client.models.ProjectTemplate.get({ id: templateId }),
    client.models.Workspace.get({ id: workspaceId }),
  ]);
  const template = templateResult.data;
  const workspace = workspaceResult.data;

  if (templateResult.errors?.length || !template || template.status !== "PUBLISHED") {
    throw new Error("TEMPLATE_NOT_FOUND");
  }
  if (workspaceResult.errors?.length || !workspace) {
    throw new Error("WORKSPACE_NOT_FOUND");
  }
  if (!includesIdentity(workspace.ownerIdentities, identity)) {
    throw new Error("WORKSPACE_OWNER_REQUIRED");
  }

  const profileResult = await client.models.UserProfile.get({
    id: workspace.ownerProfileId,
  });
  const profile = profileResult.data;
  if (profileResult.errors?.length || !profile) {
    throw new Error("PROFILE_NOT_FOUND");
  }

  const bundle = await readTemplateBundle(template.bundleKey);
  const projectId = projectIdForRequest(identity, requestId);
  const existingProjectResult = await client.models.Project.get({ id: projectId });
  const existingProject = existingProjectResult.data;

  if (existingProjectResult.errors?.length) {
    throw new Error("PROJECT_IDEMPOTENCY_LOOKUP_FAILED");
  }
  if (existingProject?.status === "ACTIVE" && existingProject.activeDiagramId) {
    return {
      projectId: existingProject.id,
      activeDiagramId: existingProject.activeDiagramId,
      templateId,
      projectName: existingProject.name,
    };
  }
  if (existingProject) {
    await cleanupProject(projectId);
  }

  const ownerIdentities = identityValues(identity);
  const diagramIdMap = new Map(
    bundle.diagrams.map((diagram) => [
      diagram.ref,
      diagramIdForRef(projectId, diagram.ref),
    ]),
  );
  const activeDiagramId =
    diagramIdMap.get(bundle.project.activeDiagramRef) ??
    diagramIdMap.get(bundle.diagrams[0].ref);
  if (!activeDiagramId) throw new Error("TEMPLATE_ACTIVE_DIAGRAM_INVALID");

  const projectName =
    normalizeOptionalText(args.projectName) || `${template.name} - copia`;
  const createProjectResult = await client.models.Project.create({
    id: projectId,
    workspaceId: workspace.id,
    name: projectName,
    description: bundle.project.description || template.description || "",
    multiDiagram: Boolean(bundle.project.multiDiagram),
    status: "CREATING",
    activeDiagramId,
    ownerProfileId: profile.id,
    ownerDisplayName: profile.displayName,
    ownerEmail: profile.email,
    createdByIdentity: identity.identityKey || identity.sub,
    ownerIdentities,
    editorIdentities: [],
    viewerIdentities: [],
    diagramCount: 0,
    memberCount: 1,
    accessVersion: 1,
    sourceTemplateId: template.id,
    sourceTemplateName: template.name,
  });

  if (createProjectResult.errors?.length || !createProjectResult.data) {
    throw new Error("TEMPLATE_PROJECT_CREATE_FAILED");
  }

  try {
    for (const bundleDiagram of bundle.diagrams) {
      const diagramId = diagramIdMap.get(bundleDiagram.ref);
      if (!diagramId) throw new Error("TEMPLATE_DIAGRAM_MAPPING_FAILED");
      const storageKey = expectedDiagramKey(projectId, diagramId);
      const remapped = remapStringValues(
        bundleDiagram.document,
        diagramIdMap,
      ) as Record<string, unknown>;
      remapped.id = diagramId;
      remapped.name = bundleDiagram.name;
      remapped.updatedAt = new Date().toISOString();

      const createDiagramResult = await client.models.Diagram.create({
        id: diagramId,
        projectId,
        name: bundleDiagram.name,
        description: bundleDiagram.description ?? "",
        status: "ACTIVE",
        position: bundleDiagram.position,
        storageKey,
        storageVersion: 0,
        documentBytes: 0,
        ownerIdentities,
        editorIdentities: [],
        viewerIdentities: [],
      });
      if (createDiagramResult.errors?.length || !createDiagramResult.data) {
        throw new Error("TEMPLATE_DIAGRAM_CREATE_FAILED");
      }

      const metadata = await putJson(storageKey, remapped, {
        projectid: projectId,
        diagramid: diagramId,
        sourcetemplateid: template.id,
      });
      const updateDiagramResult = await client.models.Diagram.update({
        id: diagramId,
        storageVersion: 1,
        documentBytes: metadata.documentBytes,
        documentChecksum: metadata.documentChecksum,
        lastSavedAt: new Date().toISOString(),
      });
      if (updateDiagramResult.errors?.length || !updateDiagramResult.data) {
        throw new Error("TEMPLATE_DIAGRAM_METADATA_UPDATE_FAILED");
      }
    }

    const memberResult = await client.models.ProjectMember.create({
      id: `member-${randomUUID()}`,
      projectId,
      profileId: profile.id,
      cognitoId: identity.sub,
      email: profile.email,
      displayName: profile.displayName,
      role: "OWNER",
      status: "ACTIVE",
      managerIdentities: ownerIdentities,
      memberIdentities: ownerIdentities,
    });
    if (memberResult.errors?.length || !memberResult.data) {
      throw new Error("TEMPLATE_PROJECT_MEMBER_CREATE_FAILED");
    }

    const activateResult = await client.models.Project.update({
      id: projectId,
      status: "ACTIVE",
      activeDiagramId,
      diagramCount: bundle.diagrams.length,
    });
    if (activateResult.errors?.length || !activateResult.data) {
      throw new Error("TEMPLATE_PROJECT_ACTIVATION_FAILED");
    }

    const workspaceUpdateResult = await client.models.Workspace.update({
      id: workspace.id,
      projectCount: Number(workspace.projectCount ?? 0) + 1,
    });
    if (workspaceUpdateResult.errors?.length || !workspaceUpdateResult.data) {
      throw new Error("WORKSPACE_PROJECT_COUNT_UPDATE_FAILED");
    }
  } catch (error) {
    await cleanupProject(projectId);
    throw error;
  }

  return {
    projectId,
    activeDiagramId,
    templateId,
    projectName,
  };
}

export const handler: AppSyncResolverHandler<Arguments, HandlerResult> = async (
  event,
) => {
  const identity = getIdentity(event.identity);
  if (!identity.sub) throw new Error("UNAUTHENTICATED");

  const action = resolveAction(
    event as unknown as RuntimeEvent,
    event.arguments.action,
  );

  console.log("project-template-manager:request", {
    action,
    userSub: identity.sub,
    sourceProjectId: event.arguments.sourceProjectId ?? null,
    templateId: event.arguments.templateId ?? null,
    workspaceId: event.arguments.workspaceId ?? null,
  });

  if (action === "LIST") return listTemplates();
  if (action === "PUBLISH") return publishTemplate(event.arguments, identity);
  return instantiateTemplate(event.arguments, identity);
};
