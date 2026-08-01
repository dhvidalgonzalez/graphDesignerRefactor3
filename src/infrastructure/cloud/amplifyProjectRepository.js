import { createEmptyDiagram } from "../../domain/diagram/createDiagram.js";
import { createSampleDiagram } from "../../domain/diagram/sampleDiagram.js";
import { createId } from "../../utils/id.js";
import {
  createDiagramConnectionCatalog,
  remapInternalDiagramReferences,
  removeLogicalConnectionsToDiagram,
} from "../../domain/electrical/projectTopology.js";
import { identityValues } from "../../services/api/helpers/index.js";
import listProjectsService from "../../services/project/list/index.js";
import getProjectService from "../../services/project/get/index.js";
import createProjectService from "../../services/project/create/index.js";
import updateProjectService from "../../services/project/update/index.js";
import deleteProjectService from "../../services/project/delete/index.js";
import syncProjectDiagramsService from "../../services/project/syncDiagrams/index.js";
import listDiagramsByProjectService from "../../services/diagram/list/index.js";
import getDiagramService from "../../services/diagram/get/index.js";
import createDiagramService from "../../services/diagram/create/index.js";
import updateDiagramService from "../../services/diagram/update/index.js";
import deleteDiagramService from "../../services/diagram/delete/index.js";
import saveDiagramDocumentService from "../../services/diagram/document/save/index.js";
import loadDiagramDocumentService from "../../services/diagram/document/load/index.js";
import removeDiagramDocumentService from "../../services/diagram/document/remove/index.js";
import listMembersByProjectService from "../../services/member/list/index.js";
import createMemberService from "../../services/member/create/index.js";
import deleteMemberService from "../../services/member/delete/index.js";
import { listInvitationsByProjectService } from "../../services/invitation/list/index.js";
import createInvitationService from "../../services/invitation/create/index.js";
import resendInvitationService from "../../services/invitation/resend/index.js";
import acceptInvitationService from "../../services/invitation/accept/index.js";
import { listMyInvitationsService } from "../../services/invitation/list/index.js";
import deleteInvitationService from "../../services/invitation/delete/index.js";
import updateWorkspaceService from "../../services/workspace/update/index.js";
import listProjectTemplatesService from "../../services/template/list/index.js";
import publishProjectTemplateService from "../../services/template/publish/index.js";
import instantiateProjectTemplateService from "../../services/template/instantiate/index.js";
import localDiagramDraftRepository from "../drafts/localDiagramDraftRepository.js";

function normalizeRole(role) {
  return String(role || "VIEWER").toLowerCase();
}

function includesAny(values, candidates) {
  const source = new Set((values ?? []).filter(Boolean));
  return candidates.some((candidate) => source.has(candidate));
}

function roleForProject(record, session) {
  if (!record || !session) return "viewer";
  if (record.ownerProfileId === session.userId) return "owner";
  const candidates = identityValues(session);
  if (includesAny(record.ownerIdentities, candidates)) return "owner";
  if (includesAny(record.editorIdentities, candidates)) return "editor";
  return "viewer";
}

function sheetFromRecord(record, document = null) {
  const normalizedDocument = document ? structuredClone(document) : null;
  if (normalizedDocument) {
    normalizedDocument.id = record.id;
    normalizedDocument.name = record.name;
  }
  return {
    id: record.id,
    name: record.name,
    description: record.description || "",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    storageKey: record.storageKey,
    storageVersion: record.storageVersion ?? 0,
    documentBytes: record.documentBytes ?? 0,
    documentChecksum: record.documentChecksum || null,
    lastSavedAt: record.lastSavedAt || null,
    position: record.position ?? 0,
    document: normalizedDocument,
    connectionCatalog: null,
  };
}

function memberFromRecord(record) {
  return {
    id: record.profileId || record.id,
    recordId: record.id,
    displayName: record.displayName,
    email: record.email,
    role: normalizeRole(record.role),
    status: String(record.status || "ACTIVE").toLowerCase(),
  };
}

function pendingMemberFromInvitation(record) {
  return {
    id: `invitation:${record.id}`,
    invitationId: record.id,
    displayName: record.email,
    email: record.email,
    role: normalizeRole(record.role),
    status: "pending",
    expiresAt: record.expiresAt,
  };
}

function summaryFromRecord(record, session) {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    name: record.name,
    description: record.description || "",
    diagramCount: record.diagramCount ?? 0,
    multiDiagram: Boolean(record.multiDiagram),
    memberCount: record.memberCount ?? 1,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    role: roleForProject(record, session),
    shared: record.ownerProfileId !== session.userId,
    sourceTemplateId: record.sourceTemplateId || null,
    sourceTemplateName: record.sourceTemplateName || null,
    publishedTemplateId: record.publishedTemplateId || null,
  };
}

async function safeList(loader) {
  try {
    return await loader();
  } catch (error) {
    console.warn("No fue posible cargar una colección complementaria.", error);
    return [];
  }
}

export class AmplifyProjectRepository {
  constructor({ session, profile, workspace }) {
    this.session = session;
    this.profile = profile;
    this.workspace = workspace;
    this.connectionCatalogCache = new Map();
  }

  async list() {
    const records = await listProjectsService();
    return records
      .filter((record) => record.status === "ACTIVE")
      .map((record) => summaryFromRecord(record, this.session));
  }

  async loadDocument(projectId, diagramRecord, { forceRemote = false } = {}) {
    const remoteDocument = await loadDiagramDocumentService(projectId, diagramRecord.id);
    const draft = localDiagramDraftRepository.get({
      userId: this.session.userId,
      projectId,
      diagramId: diagramRecord.id,
    });

    const remoteVersion = Number(diagramRecord.storageVersion ?? 0);
    const draftBaseVersion = draft?.baseStorageVersion == null
      ? null
      : Number(draft.baseStorageVersion);
    const remoteTime = new Date(
      diagramRecord.lastSavedAt || diagramRecord.updatedAt || 0,
    ).getTime();
    const draftTime = new Date(draft?.savedAt || 0).getTime();
    const draftMatchesRemote = draftBaseVersion == null
      ? draftTime > remoteTime
      : draftBaseVersion === remoteVersion;
    const useDraft = Boolean(
      !forceRemote &&
      draft?.document &&
      draftMatchesRemote &&
      draftTime > remoteTime,
    );


    return {
      document: useDraft ? draft.document : remoteDocument,
      recoveredDraft: useDraft,
      staleDraft: Boolean(draft?.document && !draftMatchesRemote),
      remoteVersion,
    };
  }

  catalogCacheKey(projectId, diagramId, storageVersion) {
    return `${projectId}:${diagramId}:${Number(storageVersion ?? 0)}`;
  }

  cacheConnectionCatalog(projectId, diagramRecord, document) {
    const catalog = createDiagramConnectionCatalog(document, {
      diagramId: diagramRecord.id,
      diagramName: diagramRecord.name || document?.name,
    });
    if (!catalog) return null;
    this.connectionCatalogCache.set(
      this.catalogCacheKey(projectId, diagramRecord.id, diagramRecord.storageVersion),
      catalog,
    );
    return catalog;
  }

  getCachedConnectionCatalog(projectId, diagramRecord) {
    return this.connectionCatalogCache.get(
      this.catalogCacheKey(projectId, diagramRecord.id, diagramRecord.storageVersion),
    ) ?? null;
  }

  async ensureProjectConnectionCatalog(project, { force = false, onProgress = null } = {}) {
    if (!project?.multiDiagram) return project;
    const diagrams = [];
    const total = project.diagrams.length;
    let completed = 0;

    for (const sheet of project.diagrams) {
      let connectionCatalog = !force ? sheet.connectionCatalog : null;
      if (!connectionCatalog && sheet.document) {
        connectionCatalog = createDiagramConnectionCatalog(sheet.document, {
          diagramId: sheet.id,
          diagramName: sheet.name,
        });
      }
      if (!connectionCatalog && !force) {
        connectionCatalog = this.getCachedConnectionCatalog(project.id, sheet);
      }
      if (!connectionCatalog) {
        try {
          const loaded = await this.loadDocument(project.id, sheet);
          connectionCatalog = this.cacheConnectionCatalog(project.id, sheet, loaded.document);
        } catch (error) {
          throw new Error(
            `No fue posible cargar los componentes de “${sheet.name}”: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } else {
        this.connectionCatalogCache.set(
          this.catalogCacheKey(project.id, sheet.id, sheet.storageVersion),
          connectionCatalog,
        );
      }
      completed += 1;
      onProgress?.({ completed, total, diagramId: sheet.id, diagramName: sheet.name });
      diagrams.push({ ...sheet, connectionCatalog });
    }

    return { ...project, diagrams };
  }

  async prepareProjectAnalysis(project, {
    activeDiagramId,
    activeDocument,
    onProgress = null,
  } = {}) {
    if (!project?.id) throw new Error("No se encontró el proyecto activo.");
    const diagramRecords = await listDiagramsByProjectService(project.id);
    if (!diagramRecords.length) throw new Error("El proyecto no contiene diagramas para analizar.");

    const total = diagramRecords.length;
    const sheets = [];
    const savedDraftDiagramIds = [];
    let completed = 0;

    for (const record of diagramRecords) {
      let currentRecord = record;
      let document;

      if (record.id === activeDiagramId && activeDocument) {
        document = structuredClone(activeDocument);
      } else {
        let loaded;
        try {
          loaded = await this.loadDocument(project.id, record);
        } catch (error) {
          throw new Error(
            `No fue posible preparar la hoja “${record.name}”: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        document = loaded.document;
        if (loaded.recoveredDraft && project.canEdit) {
          const metadata = await saveDiagramDocumentService(project.id, record.id, document);
          currentRecord = await updateDiagramService({
            id: record.id,
            name: document.name || record.name,
            ...metadata,
            storageVersion: Number(record.storageVersion ?? 0) + 1,
          });
          localDiagramDraftRepository.remove({
            userId: this.session.userId,
            projectId: project.id,
            diagramId: record.id,
          });
          savedDraftDiagramIds.push(record.id);
        }
      }

      const connectionCatalog = this.cacheConnectionCatalog(
        project.id,
        currentRecord,
        document,
      );
      sheets.push({
        ...sheetFromRecord(currentRecord, document),
        connectionCatalog,
      });
      completed += 1;
      onProgress?.({
        completed,
        total,
        diagramId: record.id,
        diagramName: record.name,
        recoveredDraft: savedDraftDiagramIds.includes(record.id),
      });
    }

    const activeSheet = sheets.find((sheet) => sheet.id === activeDiagramId) ?? sheets[0];
    return {
      projectSnapshot: {
        ...project,
        activeDiagramId: activeSheet.id,
        diagrams: sheets,
      },
      diagramVersions: Object.fromEntries(
        sheets.map((sheet) => [sheet.id, Number(sheet.storageVersion ?? 0)]),
      ),
      savedDraftDiagramIds,
    };
  }

  async get(projectId, { loadDiagramId = null } = {}) {
    const projectRecord = await getProjectService(projectId);
    if (!projectRecord) return null;

    const [diagramRecords, memberRecords, invitationRecords] = await Promise.all([
      listDiagramsByProjectService(projectId),
      safeList(() => listMembersByProjectService(projectId)),
      safeList(() => listInvitationsByProjectService(projectId)),
    ]);

    const activeDiagramId = diagramRecords.some((item) => item.id === (loadDiagramId || projectRecord.activeDiagramId))
      ? (loadDiagramId || projectRecord.activeDiagramId)
      : diagramRecords[0]?.id ?? null;

    let loaded = null;
    if (loadDiagramId && activeDiagramId) {
      const activeRecord = diagramRecords.find((item) => item.id === activeDiagramId);
      if (activeRecord) loaded = await this.loadDocument(projectId, activeRecord);
    }

    const diagrams = diagramRecords.map((record) => {
      const document = record.id === activeDiagramId ? loaded?.document : null;
      const sheet = sheetFromRecord(record, document);
      const connectionCatalog = document
        ? this.cacheConnectionCatalog(projectId, record, document)
        : this.getCachedConnectionCatalog(projectId, record);
      return { ...sheet, connectionCatalog };
    });

    const role = roleForProject(projectRecord, this.session);
    const members = memberRecords.map(memberFromRecord);
    const owner = {
      id: projectRecord.ownerProfileId,
      displayName: projectRecord.ownerDisplayName,
      email: projectRecord.ownerEmail,
    };
    if (!members.some((member) => member.id === owner.id)) {
      members.unshift({ ...owner, role: "owner", status: "active" });
    }
    invitationRecords
      .filter((item) => item.status === "PENDING")
      .forEach((item) => members.push(pendingMemberFromInvitation(item)));

    return {
      schemaVersion: 2,
      id: projectRecord.id,
      workspaceId: projectRecord.workspaceId,
      name: projectRecord.name,
      description: projectRecord.description || "",
      multiDiagram: Boolean(projectRecord.multiDiagram),
      createdAt: projectRecord.createdAt,
      updatedAt: projectRecord.updatedAt,
      activeDiagramId,
      owner,
      members,
      invitations: invitationRecords,
      diagrams,
      role,
      canEdit: role === "owner" || role === "editor",
      canManage: role === "owner",
      recoveredDraft: loaded?.recoveredDraft ?? false,
      staleDraft: loaded?.staleDraft ?? false,
      editorRevision: 0,
      remoteUpdateAvailable: null,
      publishedTemplateId: projectRecord.publishedTemplateId || null,
      sourceTemplateId: projectRecord.sourceTemplateId || null,
      sourceTemplateName: projectRecord.sourceTemplateName || null,
      cloudRecord: projectRecord,
    };
  }

  async create({ name, description = "", sample = false, multiDiagram = false }) {
    const projectId = createId("project");
    const diagramId = createId("diagram");
    const diagramName = sample ? "Diagrama de demostración" : "Diagrama 1";
    const ownerIdentities = identityValues(this.session);
    const document = sample
      ? { ...createSampleDiagram(), id: diagramId, name: diagramName }
      : createEmptyDiagram({ id: diagramId, name: diagramName });
    const storageKey = `projects/${projectId}/diagrams/${diagramId}/document.json`;

    await createProjectService({
      id: projectId,
      workspaceId: this.workspace.id,
      name: String(name || "Proyecto sin nombre").trim() || "Proyecto sin nombre",
      description: String(description || "").trim(),
      multiDiagram: Boolean(multiDiagram),
      status: "ACTIVE",
      activeDiagramId: diagramId,
      ownerProfileId: this.profile.id,
      ownerDisplayName: this.profile.displayName,
      ownerEmail: this.profile.email,
      createdByIdentity: this.session.identityKey,
      ownerIdentities,
      editorIdentities: [],
      viewerIdentities: [],
      diagramCount: 0,
      memberCount: 1,
      accessVersion: 1,
    });

    let diagramCreated = false;
    let memberRecord = null;
    try {
      await createDiagramService({
        id: diagramId,
        projectId,
        name: diagramName,
        description: "",
        status: "ACTIVE",
        position: 0,
        storageKey,
        storageVersion: 0,
        documentBytes: 0,
        ownerIdentities,
        editorIdentities: [],
        viewerIdentities: [],
      });
      diagramCreated = true;
      const fileMetadata = await saveDiagramDocumentService(projectId, diagramId, document);
      await updateDiagramService({
        id: diagramId,
        ...fileMetadata,
        storageVersion: 1,
      });
      memberRecord = await createMemberService({
        projectId,
        profileId: this.profile.id,
        cognitoId: this.session.userId,
        email: this.profile.email,
        displayName: this.profile.displayName,
        role: "OWNER",
        status: "ACTIVE",
        managerIdentities: ownerIdentities,
        memberIdentities: ownerIdentities,
      });
      await syncProjectDiagramsService(projectId, diagramId);
      await updateWorkspaceService({
        id: this.workspace.id,
        projectCount: (this.workspace.projectCount ?? 0) + 1,
      });
    } catch (error) {
      if (diagramCreated) {
        try { await removeDiagramDocumentService(projectId, diagramId); } catch { /* limpieza por mejor esfuerzo */ }
        try { await deleteDiagramService(diagramId); } catch { /* limpieza por mejor esfuerzo */ }
      }
      if (memberRecord?.id) {
        try { await deleteMemberService(memberRecord.id); } catch { /* limpieza por mejor esfuerzo */ }
      }
      try { await deleteProjectService(projectId); } catch { /* limpieza por mejor esfuerzo */ }
      throw error;
    }

    this.workspace.projectCount = (this.workspace.projectCount ?? 0) + 1;
    return this.get(projectId, { loadDiagramId: diagramId });
  }

  async updateProject(projectId, patch) {
    const updated = await updateProjectService({
      id: projectId,
      ...(patch.name != null ? { name: String(patch.name).trim() || "Proyecto sin nombre" } : {}),
      ...(patch.description != null ? { description: String(patch.description).trim() } : {}),
      ...(patch.multiDiagram != null ? { multiDiagram: Boolean(patch.multiDiagram) } : {}),
    });
    return updated;
  }

  async saveDiagramDocument(projectId, diagramId, document, { expectedStorageVersion = null } = {}) {
    const diagrams = await listDiagramsByProjectService(projectId);
    const current = diagrams.find((item) => item.id === diagramId);
    if (!current) throw new Error("El diagrama ya no existe en el proyecto.");
    if (
      expectedStorageVersion != null &&
      Number(current.storageVersion ?? 0) !== Number(expectedStorageVersion)
    ) {
      const conflict = new Error("Otra persona guardó una versión más reciente del diagrama.");
      conflict.code = "REMOTE_VERSION_CHANGED";
      throw conflict;
    }
    localDiagramDraftRepository.save({
      userId: this.session.userId,
      projectId,
      diagramId,
      document,
      baseStorageVersion: current.storageVersion ?? 0,
    });
    const metadata = await saveDiagramDocumentService(projectId, diagramId, document);
    const updated = await updateDiagramService({
      id: diagramId,
      name: document.name || current.name,
      ...metadata,
      storageVersion: (current.storageVersion ?? 0) + 1,
    });
    const connectionCatalog = this.cacheConnectionCatalog(projectId, updated, document);
    localDiagramDraftRepository.remove({ userId: this.session.userId, projectId, diagramId });
    return { ...updated, connectionCatalog };
  }

  saveDraft(projectId, diagramId, document, { baseStorageVersion = null } = {}) {
    return localDiagramDraftRepository.save({
      userId: this.session.userId,
      projectId,
      diagramId,
      document,
      baseStorageVersion,
    });
  }

  async getDiagramMetadata(diagramId) {
    return getDiagramService(diagramId);
  }

  async reloadDiagramFromCloud(projectId, diagramId) {
    const record = await getDiagramService(diagramId);
    if (record.projectId !== projectId) {
      throw new Error("El diagrama no pertenece al proyecto activo.");
    }
    const loaded = await this.loadDocument(projectId, record, { forceRemote: true });
    localDiagramDraftRepository.remove({
      userId: this.session.userId,
      projectId,
      diagramId,
    });
    const connectionCatalog = this.cacheConnectionCatalog(
      projectId,
      record,
      loaded.document,
    );
    return {
      sheet: { ...sheetFromRecord(record, loaded.document), connectionCatalog },
      document: loaded.document,
    };
  }

  async createDiagram(project, { sample = false } = {}) {
    if (!project.canEdit) throw new Error("Este proyecto está disponible sólo para lectura.");
    const diagramId = createId("diagram");
    const name = this.nextDiagramName(project);
    const document = sample
      ? { ...createSampleDiagram(), id: diagramId, name }
      : createEmptyDiagram({ id: diagramId, name });
    await createDiagramService({
      id: diagramId,
      projectId: project.id,
      name,
      description: "",
      status: "ACTIVE",
      position: project.diagrams.length,
      storageKey: `projects/${project.id}/diagrams/${diagramId}/document.json`,
      storageVersion: 0,
      documentBytes: 0,
      ownerIdentities: project.cloudRecord.ownerIdentities ?? [],
      editorIdentities: project.cloudRecord.editorIdentities ?? [],
      viewerIdentities: project.cloudRecord.viewerIdentities ?? [],
    });
    try {
      const metadata = await saveDiagramDocumentService(project.id, diagramId, document);
      const updated = await updateDiagramService({ id: diagramId, ...metadata, storageVersion: 1 });
      const connectionCatalog = this.cacheConnectionCatalog(project.id, updated, document);
      await syncProjectDiagramsService(project.id, diagramId);
      return { ...sheetFromRecord(updated, document), connectionCatalog };
    } catch (error) {
      try { await removeDiagramDocumentService(project.id, diagramId); } catch { /* limpieza por mejor esfuerzo */ }
      try { await deleteDiagramService(diagramId); } catch { /* limpieza por mejor esfuerzo */ }
      throw error;
    }
  }

  async selectDiagram(project, diagramId) {
    if (!project?.id) throw new Error("No se encontró el proyecto activo.");
    if (project.canEdit) {
      await syncProjectDiagramsService(project.id, diagramId);
    }
    return this.get(project.id, { loadDiagramId: diagramId });
  }

  async renameDiagram(projectId, diagramId, name) {
    return updateDiagramService({
      id: diagramId,
      name: String(name || "").trim() || "Diagrama sin nombre",
    });
  }

  async duplicateDiagram(project, diagramId) {
    const source = project.diagrams.find((item) => item.id === diagramId);
    if (!source) throw new Error("No se encontró la hoja que se quiere duplicar.");
    const sourceDocument = source.document
      ?? (await this.loadDocument(project.id, source)).document;
    const copyId = createId("diagram");
    const copyName = `${source.name} copia`;
    const copyDocument = remapInternalDiagramReferences(
      sourceDocument,
      source.id,
      copyId,
    );
    copyDocument.id = copyId;
    copyDocument.name = copyName;
    await createDiagramService({
      id: copyId,
      projectId: project.id,
      name: copyName,
      description: source.description || "",
      status: "ACTIVE",
      position: project.diagrams.length,
      storageKey: `projects/${project.id}/diagrams/${copyId}/document.json`,
      storageVersion: 0,
      documentBytes: 0,
      ownerIdentities: project.cloudRecord.ownerIdentities ?? [],
      editorIdentities: project.cloudRecord.editorIdentities ?? [],
      viewerIdentities: project.cloudRecord.viewerIdentities ?? [],
    });
    try {
      const metadata = await saveDiagramDocumentService(project.id, copyId, copyDocument);
      const updated = await updateDiagramService({ id: copyId, ...metadata, storageVersion: 1 });
      const connectionCatalog = this.cacheConnectionCatalog(project.id, updated, copyDocument);
      await syncProjectDiagramsService(project.id, copyId);
      return { ...sheetFromRecord(updated, copyDocument), connectionCatalog };
    } catch (error) {
      try { await removeDiagramDocumentService(project.id, copyId); } catch { /* limpieza por mejor esfuerzo */ }
      try { await deleteDiagramService(copyId); } catch { /* limpieza por mejor esfuerzo */ }
      throw error;
    }
  }

  async deleteDiagram(project, diagramId) {
    if (!project.canEdit) throw new Error("Este proyecto está disponible sólo para lectura.");
    if (project.diagrams.length <= 1) throw new Error("El proyecto debe conservar al menos una hoja.");
    const index = project.diagrams.findIndex((item) => item.id === diagramId);
    if (index < 0) return null;

    for (const sheet of project.diagrams) {
      if (sheet.id === diagramId) continue;
      const sourceDocument = sheet.document
        ?? (await this.loadDocument(project.id, sheet)).document;
      const cleaned = removeLogicalConnectionsToDiagram(sourceDocument, diagramId);
      if (!cleaned.removedCount) continue;
      await this.saveDiagramDocument(project.id, sheet.id, cleaned.document, {
        expectedStorageVersion: sheet.storageVersion ?? null,
      });
    }

    await removeDiagramDocumentService(project.id, diagramId);
    await deleteDiagramService(diagramId);
    const remaining = project.diagrams.filter((item) => item.id !== diagramId);
    const activeDiagramId = project.activeDiagramId === diagramId
      ? remaining[Math.min(index, remaining.length - 1)].id
      : project.activeDiagramId;
    await syncProjectDiagramsService(project.id, activeDiagramId);
    return activeDiagramId;
  }

  async moveDiagram(project, diagramId, direction) {
    const diagrams = [...project.diagrams];
    const index = diagrams.findIndex((item) => item.id === diagramId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= diagrams.length) return diagrams;
    [diagrams[index], diagrams[target]] = [diagrams[target], diagrams[index]];
    await Promise.all(diagrams.map((item, position) => (
      item.position === position ? null : updateDiagramService({ id: item.id, position })
    )));
    return diagrams.map((item, position) => ({ ...item, position }));
  }

  async deleteProject(project) {
    if (project.role !== "owner") throw new Error("Sólo el propietario puede eliminar el proyecto.");
    const [members, invitations] = await Promise.all([
      safeList(() => listMembersByProjectService(project.id)),
      safeList(() => listInvitationsByProjectService(project.id)),
    ]);
    for (const diagram of project.diagrams) {
      await removeDiagramDocumentService(project.id, diagram.id);
      await deleteDiagramService(diagram.id);
      localDiagramDraftRepository.remove({ userId: this.session.userId, projectId: project.id, diagramId: diagram.id });
    }
    await Promise.all(invitations.map((item) => deleteInvitationService(item.id)));
    await Promise.all(members.map((item) => deleteMemberService(item.id)));
    await deleteProjectService(project.id);
    const nextCount = Math.max(0, (this.workspace.projectCount ?? 1) - 1);
    await updateWorkspaceService({ id: this.workspace.id, projectCount: nextCount });
    this.workspace.projectCount = nextCount;
    return true;
  }



  async listTemplates() {
    return listProjectTemplatesService();
  }

  async publishTemplate(project, input) {
    if (!this.session?.isGlobalAdmin) {
      throw new Error("Sólo un Global Admin puede publicar ejemplos.");
    }
    if (!project?.canManage || project.role !== "owner") {
      throw new Error("Sólo el propietario del proyecto puede publicarlo como ejemplo.");
    }
    return publishProjectTemplateService({
      sourceProjectId: project.id,
      templateId: project.publishedTemplateId || null,
      name: String(input.name || project.name).trim() || project.name,
      description: String(input.description ?? project.description ?? "").trim(),
      category: String(input.category || "").trim(),
      featured: Boolean(input.featured),
    });
  }

  async instantiateTemplate(template) {
    if (!template?.id) throw new Error("No se encontró el ejemplo seleccionado.");
    const result = await instantiateProjectTemplateService({
      templateId: template.id,
      workspaceId: this.workspace.id,
      projectName: `${template.name} - copia`,
      clientRequestId: createId("template-copy"),
    });
    this.workspace.projectCount = (this.workspace.projectCount ?? 0) + 1;
    return this.get(result.projectId, { loadDiagramId: result.activeDiagramId });
  }

  async listMyInvitations() {
    const records = await listMyInvitationsService(this.session.email);
    return records
      .filter((item) => item.status === "PENDING" && new Date(item.expiresAt).getTime() > Date.now())
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async acceptInvitation(invitationId) {
    await acceptInvitationService(invitationId);
    return true;
  }

  async invite(project, { email, role }) {
    if (!project.canManage) throw new Error("Sólo el propietario puede invitar personas.");
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) throw new Error("Ingresa un correo electrónico válido.");
    if (normalizedEmail === this.session.email.toLowerCase()) throw new Error("Ya eres propietario de este proyecto.");

    return createInvitationService({
      projectId: project.id,
      email: normalizedEmail,
      role: String(role || "viewer").toUpperCase(),
    });
  }

  async resendInvitation(project, invitationId) {
    if (!project.canManage) throw new Error("Sólo el propietario puede reenviar invitaciones.");
    return resendInvitationService(invitationId);
  }

  nextDiagramName(project) {
    const used = new Set(project.diagrams.map((sheet) => sheet.name));
    let index = project.diagrams.length + 1;
    while (used.has(`Diagrama ${index}`)) index += 1;
    return `Diagrama ${index}`;
  }
}

export default AmplifyProjectRepository;
