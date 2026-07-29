import type {
  AppSyncIdentityCognito,
  AppSyncResolverHandler,
} from "aws-lambda";
import { randomUUID } from "node:crypto";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { env } from "$amplify/env/project-invitation";
import type { Schema } from "../../data/resource";

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();
const ses = new SESv2Client({});

const INVITATION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const APP_URL = String(env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
const APP_NAME = String(env.APP_NAME || "Graph Designer");
const SES_FROM_EMAIL = String(env.SES_FROM_EMAIL || "").trim();

const EMAIL_STATUS = {
  PENDING: "PENDING",
  SENT: "SENT",
  FAILED: "FAILED",
} as const;

type ProjectRole = "EDITOR" | "VIEWER";
type EmailDeliveryStatus = keyof typeof EMAIL_STATUS;

type Arguments = {
  invitationId?: string | null;
  projectId?: string | null;
  email?: string | null;
  role?: string | null;
};

type DeliveryResult = {
  invitationId: string;
  projectId: string;
  projectName: string;
  email: string;
  role: ProjectRole;
  status: string;
  expiresAt: string;
  emailDeliveryStatus: EmailDeliveryStatus;
  emailSentAt?: string | null;
  emailError?: string | null;
  sendCount: number;
};

type RuntimeEvent = {
  fieldName?: string;
  typeName?: string;
};

type ListDiagramsByProjectResult = Awaited<
  ReturnType<typeof client.models.Diagram.listDiagramsByProject>
>;

type ListInvitationsByProjectResult = Awaited<
  ReturnType<typeof client.models.ProjectInvitation.listInvitationsByProject>
>;

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

  return {
    sub,
    username,
    email: String(claims.email ?? "").trim().toLowerCase(),
    identityKey: sub && username ? `${sub}::${username}` : "",
  };
}

function unique(values: Array<string | null | undefined>) {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
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

  return (values ?? []).some(
    (value) => Boolean(value) && candidates.has(String(value)),
  );
}

function isProjectOwner(
  project: Schema["Project"]["type"],
  identity: ReturnType<typeof getIdentity>,
) {
  return (
    project.ownerProfileId === identity.sub ||
    includesIdentity(project.ownerIdentities, identity)
  );
}

function normalizeEmail(value: string | null | undefined) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("INVALID_INVITATION_EMAIL");
  }
  return email;
}

function normalizeRole(value: string | null | undefined): ProjectRole {
  const role = String(value ?? "VIEWER").trim().toUpperCase();
  if (role !== "EDITOR" && role !== "VIEWER") {
    throw new Error("INVITATION_ROLE_NOT_ALLOWED");
  }
  return role;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function invitationUrl(invitationId: string) {
  return `${APP_URL}/#/invitations/${encodeURIComponent(invitationId)}`;
}

function invitationExpiresAt() {
  return new Date(Date.now() + INVITATION_DURATION_MS).toISOString();
}

function toDeliveryResult(
  invitation: Schema["ProjectInvitation"]["type"],
): DeliveryResult {
  return {
    invitationId: invitation.id,
    projectId: invitation.projectId,
    projectName: invitation.projectName,
    email: invitation.email,
    role: normalizeRole(invitation.role),
    status: String(invitation.status),
    expiresAt: invitation.expiresAt,
    emailDeliveryStatus: String(
      invitation.emailDeliveryStatus ?? EMAIL_STATUS.PENDING,
    ) as EmailDeliveryStatus,
    emailSentAt: invitation.emailSentAt ?? null,
    emailError: invitation.emailError ?? null,
    sendCount: invitation.sendCount ?? 0,
  };
}

async function getProjectForOwner(
  projectId: string,
  identity: ReturnType<typeof getIdentity>,
) {
  const result = await client.models.Project.get({ id: projectId });
  const project = result.data;

  if (result.errors?.length || !project) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  if (!isProjectOwner(project, identity)) {
    throw new Error("PROJECT_INVITATION_FORBIDDEN");
  }

  return project;
}

async function listProjectInvitations(projectId: string) {
  const invitations: Schema["ProjectInvitation"]["type"][] = [];
  let nextToken: string | null | undefined;

  do {
    const result: ListInvitationsByProjectResult =
      await client.models.ProjectInvitation.listInvitationsByProject(
        { projectId },
        { limit: 100, nextToken },
      );

    if (result.errors?.length) {
      throw new Error("INVITATION_LIST_FAILED");
    }

    invitations.push(...result.data);
    nextToken = result.nextToken;
  } while (nextToken);

  return invitations;
}

async function sendInvitationEmail(
  invitation: Schema["ProjectInvitation"]["type"],
) {
  if (!SES_FROM_EMAIL) {
    throw new Error("SES_FROM_EMAIL_NOT_CONFIGURED");
  }

  const roleLabel = invitation.role === "EDITOR" ? "edición" : "sólo lectura";
  const url = invitationUrl(invitation.id);
  const safeProjectName = escapeHtml(invitation.projectName);
  const safeInviterName = escapeHtml(invitation.invitedByDisplayName);

  const result = await ses.send(
    new SendEmailCommand({
      FromEmailAddress: SES_FROM_EMAIL,
      Destination: {
        ToAddresses: [invitation.email],
      },
      Content: {
        Simple: {
          Subject: {
            Charset: "UTF-8",
            Data: `${invitation.invitedByDisplayName} te invitó a ${invitation.projectName}`,
          },
          Body: {
            Text: {
              Charset: "UTF-8",
              Data: [
                `${invitation.invitedByDisplayName} te invitó al proyecto “${invitation.projectName}”.`,
                `Permiso: ${roleLabel}.`,
                "",
                `Inicia sesión o crea una cuenta en ${APP_NAME} para aceptar la invitación:`,
                url,
                "",
                `La invitación vence el ${new Date(invitation.expiresAt).toLocaleDateString("es-CL")}.`,
              ].join("\n"),
            },
            Html: {
              Charset: "UTF-8",
              Data: `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#f6f8fb;font-family:Arial,sans-serif;color:#172033">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#f6f8fb">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5eaf1;border-radius:16px;overflow:hidden">
            <tr>
              <td style="padding:24px 28px;background:#0f2744;color:#ffffff">
                <strong style="font-size:20px">${escapeHtml(APP_NAME)}</strong>
                <div style="margin-top:4px;font-size:13px;opacity:.8">Diagramas eléctricos colaborativos</div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px">
                <p style="margin:0 0 12px;font-size:15px;color:#58657a">Invitación a un proyecto</p>
                <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#172033">${safeProjectName}</h1>
                <p style="margin:0 0 12px;line-height:1.6"><strong>${safeInviterName}</strong> te invitó a participar con permiso de <strong>${roleLabel}</strong>.</p>
                <p style="margin:0 0 24px;line-height:1.6">Puedes iniciar sesión o crear una cuenta con este mismo correo electrónico para abrir el proyecto.</p>
                <p style="margin:0 0 26px">
                  <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;border-radius:9px;background:#176b5b;color:#ffffff;text-decoration:none;font-weight:700">Abrir invitación</a>
                </p>
                <p style="margin:0;color:#7a8699;font-size:12px;line-height:1.5">Si el botón no funciona, copia este enlace:<br><a href="${escapeHtml(url)}" style="color:#176b5b;word-break:break-all">${escapeHtml(url)}</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
            },
          },
        },
      },
    }),
  );

  return result.MessageId ?? null;
}

async function sendAndTrackInvitation(
  invitation: Schema["ProjectInvitation"]["type"],
) {
  const attemptAt = new Date().toISOString();
  const sendCount = (invitation.sendCount ?? 0) + 1;

  await client.models.ProjectInvitation.update({
    id: invitation.id,
    emailDeliveryStatus: EMAIL_STATUS.PENDING,
    emailError: null,
    lastEmailAttemptAt: attemptAt,
    sendCount,
  });

  try {
    const messageId = await sendInvitationEmail(invitation);
    const sentAt = new Date().toISOString();
    const updateResult = await client.models.ProjectInvitation.update({
      id: invitation.id,
      emailDeliveryStatus: EMAIL_STATUS.SENT,
      emailSentAt: sentAt,
      emailError: null,
      emailMessageId: messageId,
      lastEmailAttemptAt: attemptAt,
      sendCount,
    });

    if (updateResult.errors?.length || !updateResult.data) {
      throw new Error("INVITATION_EMAIL_STATUS_UPDATE_FAILED");
    }

    return updateResult.data;
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 1000) : "EMAIL_SEND_FAILED";

    const updateResult = await client.models.ProjectInvitation.update({
      id: invitation.id,
      emailDeliveryStatus: EMAIL_STATUS.FAILED,
      emailError: message,
      lastEmailAttemptAt: attemptAt,
      sendCount,
    });

    if (updateResult.data) return updateResult.data;

    return {
      ...invitation,
      emailDeliveryStatus: EMAIL_STATUS.FAILED,
      emailError: message,
      lastEmailAttemptAt: attemptAt,
      sendCount,
    } as Schema["ProjectInvitation"]["type"];
  }
}

async function createOrRefreshInvitation(
  event: Parameters<AppSyncResolverHandler<Arguments, DeliveryResult | boolean>>[0],
  identity: ReturnType<typeof getIdentity>,
) {
  const projectId = String(event.arguments.projectId ?? "");
  const email = normalizeEmail(event.arguments.email);
  const role = normalizeRole(event.arguments.role);
  const project = await getProjectForOwner(projectId, identity);

  if (email === String(project.ownerEmail).trim().toLowerCase()) {
    throw new Error("PROJECT_OWNER_ALREADY_HAS_ACCESS");
  }

  const invitations = await listProjectInvitations(projectId);
  const existing = invitations.find(
    (item) =>
      item.status === "PENDING" &&
      item.email.trim().toLowerCase() === email,
  );

  let invitation: Schema["ProjectInvitation"]["type"];

  if (existing) {
    const updateResult = await client.models.ProjectInvitation.update({
      id: existing.id,
      role,
      expiresAt: invitationExpiresAt(),
      emailDeliveryStatus: EMAIL_STATUS.PENDING,
      emailError: null,
    });

    if (updateResult.errors?.length || !updateResult.data) {
      throw new Error("INVITATION_REFRESH_FAILED");
    }

    invitation = updateResult.data;
  } else {
    const createResult = await client.models.ProjectInvitation.create({
      id: `invitation-${randomUUID()}`,
      projectId: project.id,
      projectName: project.name,
      email,
      role,
      status: "PENDING",
      invitedByProfileId: identity.sub,
      invitedByDisplayName:
        project.ownerDisplayName || project.ownerEmail || APP_NAME,
      expiresAt: invitationExpiresAt(),
      ownerIdentities: project.ownerIdentities ?? unique([
        identity.sub,
        identity.username,
        identity.identityKey,
      ]),
      recipientIdentities: [email],
      emailDeliveryStatus: EMAIL_STATUS.PENDING,
      sendCount: 0,
    });

    if (createResult.errors?.length || !createResult.data) {
      throw new Error("INVITATION_CREATE_FAILED");
    }

    invitation = createResult.data;
  }

  const delivered = await sendAndTrackInvitation(invitation);
  return toDeliveryResult(delivered);
}

async function resendInvitation(
  event: Parameters<AppSyncResolverHandler<Arguments, DeliveryResult | boolean>>[0],
  identity: ReturnType<typeof getIdentity>,
) {
  const invitationId = String(event.arguments.invitationId ?? "");
  if (!invitationId) throw new Error("INVITATION_ID_REQUIRED");

  const invitationResult = await client.models.ProjectInvitation.get({
    id: invitationId,
  });
  const invitation = invitationResult.data;

  if (invitationResult.errors?.length || !invitation) {
    throw new Error("INVITATION_NOT_FOUND");
  }

  await getProjectForOwner(invitation.projectId, identity);

  if (invitation.status !== "PENDING") {
    throw new Error("ONLY_PENDING_INVITATIONS_CAN_BE_RESENT");
  }

  const refreshedResult = await client.models.ProjectInvitation.update({
    id: invitation.id,
    expiresAt: invitationExpiresAt(),
    emailDeliveryStatus: EMAIL_STATUS.PENDING,
    emailError: null,
  });

  if (refreshedResult.errors?.length || !refreshedResult.data) {
    throw new Error("INVITATION_REFRESH_FAILED");
  }

  const delivered = await sendAndTrackInvitation(refreshedResult.data);
  return toDeliveryResult(delivered);
}

async function acceptInvitation(
  event: Parameters<AppSyncResolverHandler<Arguments, DeliveryResult | boolean>>[0],
  identity: ReturnType<typeof getIdentity>,
) {
  const invitationId = String(event.arguments.invitationId ?? "");
  if (!invitationId) throw new Error("INVITATION_ID_REQUIRED");

  const profileResult = await client.models.UserProfile.get({ id: identity.sub });
  const profile = profileResult.data;

  if (profileResult.errors?.length || !profile) {
    throw new Error("USER_PROFILE_NOT_FOUND");
  }

  const accountEmail = normalizeEmail(profile.email);

  const invitationResult = await client.models.ProjectInvitation.get({
    id: invitationId,
  });
  const invitation = invitationResult.data;

  if (invitationResult.errors?.length || !invitation) {
    throw new Error("INVITATION_NOT_FOUND");
  }

  if (invitation.status === "ACCEPTED") return true;
  if (invitation.status !== "PENDING") {
    throw new Error("INVITATION_NOT_PENDING");
  }

  if (new Date(invitation.expiresAt).getTime() < Date.now()) {
    await client.models.ProjectInvitation.update({
      id: invitation.id,
      status: "EXPIRED",
    });
    throw new Error("INVITATION_EXPIRED");
  }

  if (invitation.email.trim().toLowerCase() !== accountEmail) {
    throw new Error("INVITATION_RECIPIENT_MISMATCH");
  }

  const role = normalizeRole(invitation.role);

  const projectResult = await client.models.Project.get({
    id: invitation.projectId,
  });
  const project = projectResult.data;

  if (projectResult.errors?.length || !project) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  if (project.ownerProfileId === identity.sub) {
    throw new Error("PROJECT_OWNER_ALREADY_HAS_ACCESS");
  }

  const memberLookup = await client.models.ProjectMember.listMembersByProfile(
    { profileId: identity.sub },
    { limit: 100 },
  );

  if (memberLookup.errors?.length) {
    throw new Error("MEMBER_LOOKUP_FAILED");
  }

  const existingMember = memberLookup.data.find(
    (member) => member.projectId === project.id,
  );
  const addsNewMember = !existingMember || existingMember.status !== "ACTIVE";

  const editors = unique(project.editorIdentities ?? []);
  const viewers = unique(project.viewerIdentities ?? []);
  const identityValues = unique([
    identity.sub,
    identity.username,
    accountEmail,
    identity.identityKey,
  ]);

  const nextEditors =
    role === "EDITOR"
      ? unique([...editors, ...identityValues])
      : editors.filter((value) => !identityValues.includes(value));
  const nextViewers =
    role === "VIEWER"
      ? unique([...viewers, ...identityValues])
      : viewers.filter((value) => !identityValues.includes(value));

  const updateProjectResult = await client.models.Project.update({
    id: project.id,
    editorIdentities: nextEditors,
    viewerIdentities: nextViewers,
    memberCount: addsNewMember
      ? (project.memberCount ?? 1) + 1
      : (project.memberCount ?? 1),
    accessVersion: (project.accessVersion ?? 1) + 1,
  });

  if (updateProjectResult.errors?.length) {
    throw new Error("PROJECT_ACCESS_UPDATE_FAILED");
  }

  let nextToken: string | null | undefined;

  do {
    const diagramsResult: ListDiagramsByProjectResult =
      await client.models.Diagram.listDiagramsByProject(
        { projectId: project.id },
        { limit: 100, nextToken },
      );

    if (diagramsResult.errors?.length) {
      throw new Error("DIAGRAM_ACCESS_LIST_FAILED");
    }

    for (const diagram of diagramsResult.data) {
      const diagramUpdate = await client.models.Diagram.update({
        id: diagram.id,
        editorIdentities: nextEditors,
        viewerIdentities: nextViewers,
      });

      if (diagramUpdate.errors?.length || !diagramUpdate.data) {
        throw new Error("DIAGRAM_ACCESS_UPDATE_FAILED");
      }
    }

    nextToken = diagramsResult.nextToken;
  } while (nextToken);

  if (existingMember) {
    const memberUpdate = await client.models.ProjectMember.update({
      id: existingMember.id,
      role,
      status: "ACTIVE",
      email: accountEmail,
      displayName: profile.displayName,
      managerIdentities: project.ownerIdentities ?? [],
      memberIdentities: unique([
        ...(project.ownerIdentities ?? []),
        ...identityValues,
      ]),
    });

    if (memberUpdate.errors?.length || !memberUpdate.data) {
      throw new Error("MEMBER_UPDATE_FAILED");
    }
  } else {
    const memberCreate = await client.models.ProjectMember.create({
      projectId: project.id,
      profileId: identity.sub,
      cognitoId: identity.sub,
      email: accountEmail,
      displayName: profile.displayName,
      role,
      status: "ACTIVE",
      managerIdentities: project.ownerIdentities ?? [],
      memberIdentities: unique([
        ...(project.ownerIdentities ?? []),
        ...identityValues,
      ]),
    });

    if (memberCreate.errors?.length || !memberCreate.data) {
      throw new Error("MEMBER_CREATE_FAILED");
    }
  }

  const invitationUpdate = await client.models.ProjectInvitation.update({
    id: invitation.id,
    status: "ACCEPTED",
    acceptedByProfileId: identity.sub,
    recipientIdentities: unique([
      ...(invitation.recipientIdentities ?? []),
      ...identityValues,
    ]),
  });

  if (invitationUpdate.errors?.length) {
    throw new Error("INVITATION_UPDATE_FAILED");
  }

  return true;
}

export const handler: AppSyncResolverHandler<
  Arguments,
  DeliveryResult | boolean
> = async (event) => {
  const runtimeEvent = event as unknown as RuntimeEvent;
  const identity = getIdentity(event.identity);

  if (!identity.sub) {
    throw new Error("UNAUTHENTICATED");
  }

  console.log("project-invitation:request", {
    typeName: runtimeEvent.typeName ?? null,
    fieldName: runtimeEvent.fieldName ?? null,
    userSub: identity.sub,
  });

  switch (runtimeEvent.fieldName) {
    case "sendProjectInvitation":
      return createOrRefreshInvitation(event, identity);
    case "resendProjectInvitation":
      return resendInvitation(event, identity);
    case "acceptProjectInvitation":
      return acceptInvitation(event, identity);
    default:
      throw new Error("UNSUPPORTED_INVITATION_OPERATION");
  }
};
