import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSession } from "../auth/SessionContext.jsx";
import AmplifyProjectRepository from "../infrastructure/cloud/amplifyProjectRepository.js";

const WorkspaceContext = createContext(null);

function setRoute(path) {
  window.location.hash = path;
}

function routeToLanding() {
  setRoute("#/");
}

function routeToWorkspace() {
  setRoute("#/workspace");
}

function routeToProject(id) {
  setRoute(`#/workspace/projects/${encodeURIComponent(id)}`);
}

function routeToEditor(id) {
  setRoute(`#/workspace/projects/${encodeURIComponent(id)}/editor`);
}

function mergeProjectConnectionCatalogs(current, catalogProject) {
  if (!current || current.id !== catalogProject?.id) return current;
  const catalogByDiagram = new Map(
    catalogProject.diagrams.map((sheet) => [sheet.id, sheet.connectionCatalog]),
  );
  return {
    ...current,
    diagrams: current.diagrams.map((sheet) => ({
      ...sheet,
      connectionCatalog:
        catalogByDiagram.get(sheet.id) ?? sheet.connectionCatalog ?? null,
    })),
  };
}

export function WorkspaceProvider({ children }) {
  const { session, profile, workspace, signOut } = useSession();
  const repository = useMemo(
    () => new AmplifyProjectRepository({ session, profile, workspace }),
    [profile, session, workspace],
  );
  const [projectSummaries, setProjectSummaries] = useState([]);
  const [myInvitations, setMyInvitations] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [inviteMembersOpen, setInviteMembersOpen] = useState(false);
  const [shareProjectOpen, setShareProjectOpen] = useState(false);
  const [connectionCatalogStatus, setConnectionCatalogStatus] = useState("idle");
  const [connectionCatalogProgress, setConnectionCatalogProgress] = useState(null);
  const [connectionCatalogError, setConnectionCatalogError] = useState(null);
  const activeProjectId = activeProject?.id ?? null;

  const refreshInvitations = useCallback(async () => {
    try {
      const invitations = await repository.listMyInvitations();
      setMyInvitations(invitations);
      return invitations;
    } catch (nextError) {
      console.warn("No fue posible cargar las invitaciones recibidas.", nextError);
      setMyInvitations([]);
      return [];
    }
  }, [repository]);

  const refreshSummaries = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const [summaries] = await Promise.all([repository.list(), refreshInvitations()]);
      setProjectSummaries(summaries);
      setStatus("ready");
      return summaries;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError : new Error(String(nextError)));
      setStatus("error");
      throw nextError;
    }
  }, [refreshInvitations, repository]);

  useEffect(() => {
    refreshSummaries().catch(() => {});
  }, [refreshSummaries]);

  const loadProject = useCallback(async (id, { loadDiagram = false, diagramId = null } = {}) => {
    setStatus("loading-project");
    setError(null);
    try {
      let project = await repository.get(id, {
        loadDiagramId: loadDiagram ? diagramId : null,
      });
      if (loadDiagram && project && !project.diagrams.some((sheet) => sheet.document)) {
        project = await repository.get(id, { loadDiagramId: project.activeDiagramId });
      }
      setActiveProject(project);
      setStatus("ready");
      return project;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError : new Error(String(nextError)));
      setStatus("error");
      throw nextError;
    }
  }, [repository]);

  const createProject = useCallback(async (input) => {
    setStatus("saving");
    setError(null);
    try {
      const project = await repository.create(input);
      setActiveProject(project);
      setCreateProjectOpen(false);
      await refreshSummaries();
      routeToProject(project.id);
      return project;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError : new Error(String(nextError)));
      setStatus("error");
      throw nextError;
    }
  }, [refreshSummaries, repository]);

  const openWorkspace = useCallback(() => {
    setActiveProject(null);
    setConnectionCatalogStatus("idle");
    setConnectionCatalogProgress(null);
    setConnectionCatalogError(null);
    setProjectSettingsOpen(false);
    setInviteMembersOpen(false);
    setShareProjectOpen(false);
    routeToWorkspace();
    refreshSummaries().catch(() => {});
  }, [refreshSummaries]);

  const openProject = useCallback(async (id) => {
    routeToProject(id);
    return loadProject(id);
  }, [loadProject]);

  const openProjectEditor = useCallback(async (id, diagramId = null) => {
    const targetDiagramId = diagramId || activeProject?.activeDiagramId || null;
    let project = await repository.get(id, { loadDiagramId: targetDiagramId });
    if (!project) return null;
    if (!project.diagrams.some((sheet) => sheet.document)) {
      throw new Error("No fue posible cargar el documento de la hoja seleccionada.");
    }
    setActiveProject(project);
    routeToEditor(project.id);

    if (project.multiDiagram) {
      setConnectionCatalogStatus("loading");
      setConnectionCatalogError(null);
      setConnectionCatalogProgress(null);
      repository.ensureProjectConnectionCatalog(project, {
          onProgress: setConnectionCatalogProgress,
        })
        .then((catalogProject) => {
          setActiveProject((current) => mergeProjectConnectionCatalogs(current, catalogProject));
          setConnectionCatalogStatus("ready");
        })
        .catch((catalogError) => {
          console.warn("No fue posible completar el catálogo multidiagrama.", catalogError);
          setConnectionCatalogStatus("error");
          setConnectionCatalogError(
            catalogError instanceof Error ? catalogError : new Error(String(catalogError)),
          );
        });
    } else {
      setConnectionCatalogStatus("idle");
      setConnectionCatalogProgress(null);
      setConnectionCatalogError(null);
    }
    return project;
  }, [activeProject?.activeDiagramId, repository]);

  const returnToProject = useCallback(() => {
    if (!activeProjectId) {
      routeToWorkspace();
      return;
    }
    setProjectSettingsOpen(false);
    setInviteMembersOpen(false);
    setShareProjectOpen(false);
    routeToProject(activeProjectId);
  }, [activeProjectId]);

  const closeProject = useCallback(() => {
    setActiveProject(null);
    setConnectionCatalogStatus("idle");
    setConnectionCatalogProgress(null);
    setConnectionCatalogError(null);
    setProjectSettingsOpen(false);
    setInviteMembersOpen(false);
    setShareProjectOpen(false);
    routeToWorkspace();
    refreshSummaries().catch(() => {});
  }, [refreshSummaries]);

  const goHome = useCallback(() => {
    setActiveProject(null);
    setConnectionCatalogStatus("idle");
    setConnectionCatalogProgress(null);
    setConnectionCatalogError(null);
    setProjectSettingsOpen(false);
    setInviteMembersOpen(false);
    setShareProjectOpen(false);
    routeToLanding();
  }, []);

  const updateProject = useCallback(async (patch) => {
    if (!activeProjectId) return null;
    const updatedRecord = await repository.updateProject(activeProjectId, patch);
    setActiveProject((current) => current?.id === activeProjectId
      ? { ...current, ...patch, updatedAt: updatedRecord.updatedAt ?? new Date().toISOString(), cloudRecord: updatedRecord }
      : current);
    if (patch.multiDiagram != null) {
      setConnectionCatalogStatus("idle");
      setConnectionCatalogProgress(null);
      setConnectionCatalogError(null);
    }
    await refreshSummaries();
    return updatedRecord;
  }, [activeProjectId, refreshSummaries, repository]);

  const refreshProjectConnectionCatalog = useCallback(async ({ force = false } = {}) => {
    if (!activeProject?.multiDiagram) return activeProject;
    setConnectionCatalogStatus("loading");
    setConnectionCatalogError(null);
    setConnectionCatalogProgress(null);
    try {
      const updated = await repository.ensureProjectConnectionCatalog(activeProject, {
        force,
        onProgress: setConnectionCatalogProgress,
      });
      setActiveProject((current) => mergeProjectConnectionCatalogs(current, updated));
      setConnectionCatalogStatus("ready");
      return updated;
    } catch (nextError) {
      const normalized = nextError instanceof Error ? nextError : new Error(String(nextError));
      setConnectionCatalogStatus("error");
      setConnectionCatalogError(normalized);
      throw normalized;
    }
  }, [activeProject, repository]);

  const prepareProjectAnalysis = useCallback(async ({
    activeDiagramId,
    activeDocument,
    onProgress,
  } = {}) => {
    if (!activeProject) throw new Error("No se encontró el proyecto activo.");
    const prepared = await repository.prepareProjectAnalysis(activeProject, {
      activeDiagramId,
      activeDocument,
      onProgress,
    });
    setActiveProject((current) => {
      if (current?.id !== activeProject.id) return current;
      const preparedById = new Map(
        prepared.projectSnapshot.diagrams.map((sheet) => [sheet.id, sheet]),
      );
      return {
        ...current,
        diagrams: current.diagrams.map((sheet) => {
          const preparedSheet = preparedById.get(sheet.id);
          if (!preparedSheet) return sheet;
          return {
            ...sheet,
            name: preparedSheet.name,
            storageKey: preparedSheet.storageKey,
            storageVersion: preparedSheet.storageVersion,
            documentBytes: preparedSheet.documentBytes,
            documentChecksum: preparedSheet.documentChecksum,
            lastSavedAt: preparedSheet.lastSavedAt,
            updatedAt: preparedSheet.updatedAt,
            connectionCatalog: preparedSheet.connectionCatalog,
          };
        }),
      };
    });
    return prepared;
  }, [activeProject, repository]);

  const saveDraft = useCallback((projectId, diagramId, document) => {
    const sheet = activeProject?.id === projectId
      ? activeProject.diagrams.find((item) => item.id === diagramId)
      : null;
    return repository.saveDraft(projectId, diagramId, document, {
      baseStorageVersion: sheet?.storageVersion ?? null,
    });
  }, [activeProject, repository]);

  const checkForRemoteChanges = useCallback(async (projectId, diagramId, knownVersion = 0) => {
    const record = await repository.getDiagramMetadata(diagramId);
    const remoteVersion = Number(record.storageVersion ?? 0);
    if (record.projectId !== projectId || remoteVersion <= Number(knownVersion ?? 0)) {
      return null;
    }

    setActiveProject((current) => current?.id === projectId
      ? {
          ...current,
          remoteUpdateAvailable: {
            diagramId,
            storageVersion: remoteVersion,
            lastSavedAt: record.lastSavedAt || record.updatedAt,
          },
        }
      : current);

    return record;
  }, [repository]);

  const reloadActiveDiagramFromCloud = useCallback(async (projectId, diagramId) => {
    if (!projectId || !diagramId) return null;
    setStatus("loading-project");
    setError(null);
    try {
      const { sheet } = await repository.reloadDiagramFromCloud(projectId, diagramId);
      setActiveProject((current) => {
        if (current?.id !== projectId) return current;
        return {
          ...current,
          updatedAt: sheet.updatedAt || current.updatedAt,
          recoveredDraft: false,
          staleDraft: false,
          remoteUpdateAvailable: null,
          editorRevision: Number(current.editorRevision ?? 0) + 1,
          diagrams: current.diagrams.map((item) => item.id === diagramId ? sheet : item),
        };
      });
      setStatus("ready");
      return sheet;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError : new Error(String(nextError)));
      setStatus("error");
      throw nextError;
    }
  }, [repository]);

  const saveDiagramDocument = useCallback(async (projectId, diagramId, document) => {
    const sheet = activeProject?.id === projectId
      ? activeProject.diagrams.find((item) => item.id === diagramId)
      : null;
    let updated;
    try {
      updated = await repository.saveDiagramDocument(projectId, diagramId, document, {
        expectedStorageVersion: sheet?.storageVersion ?? null,
      });
    } catch (nextError) {
      if (nextError?.code === "REMOTE_VERSION_CHANGED") {
        await checkForRemoteChanges(
          projectId,
          diagramId,
          sheet?.storageVersion ?? 0,
        );
      }
      throw nextError;
    }
    setActiveProject((current) => {
      if (current?.id !== projectId) return current;
      return {
        ...current,
        updatedAt: updated.updatedAt ?? new Date().toISOString(),
        remoteUpdateAvailable: null,
        diagrams: current.diagrams.map((sheet) => sheet.id === diagramId
          ? {
              ...sheet,
              name: document.name,
              updatedAt: updated.updatedAt ?? new Date().toISOString(),
              storageKey: updated.storageKey,
              storageVersion: updated.storageVersion,
              documentBytes: updated.documentBytes,
              documentChecksum: updated.documentChecksum,
              lastSavedAt: updated.lastSavedAt,
              connectionCatalog: updated.connectionCatalog ?? sheet.connectionCatalog,
              document: structuredClone(document),
            }
          : sheet),
      };
    });
    return updated;
  }, [activeProject, checkForRemoteChanges, repository]);

  const createDiagram = useCallback(async ({ sample = false } = {}) => {
    if (!activeProject) return null;
    const sheet = await repository.createDiagram(activeProject, { sample });
    setActiveProject((current) => current?.id === activeProject.id
      ? {
          ...current,
          activeDiagramId: sheet.id,
          updatedAt: new Date().toISOString(),
          diagrams: [...current.diagrams, sheet],
          cloudRecord: {
            ...current.cloudRecord,
            activeDiagramId: sheet.id,
            diagramCount: current.diagrams.length + 1,
          },
        }
      : current);
    await refreshSummaries();
    return sheet;
  }, [activeProject, refreshSummaries, repository]);

  const selectDiagram = useCallback(async (diagramId) => {
    if (!activeProject || !activeProject.diagrams.some((sheet) => sheet.id === diagramId)) return null;
    const previousCatalogs = new Map(
      activeProject.diagrams.map((sheet) => [sheet.id, sheet.connectionCatalog]),
    );
    let project = await repository.selectDiagram(activeProject, diagramId);
    project = {
      ...project,
      diagrams: project.diagrams.map((sheet) => ({
        ...sheet,
        connectionCatalog:
          sheet.connectionCatalog ?? previousCatalogs.get(sheet.id) ?? null,
      })),
    };
    setActiveProject(project);
    if (project.multiDiagram) {
      setConnectionCatalogStatus("loading");
      setConnectionCatalogError(null);
      setConnectionCatalogProgress(null);
      repository.ensureProjectConnectionCatalog(project, {
          onProgress: setConnectionCatalogProgress,
        })
        .then((catalogProject) => {
          setActiveProject((current) => mergeProjectConnectionCatalogs(current, catalogProject));
          setConnectionCatalogStatus("ready");
        })
        .catch((catalogError) => {
          console.warn("No fue posible actualizar el catálogo multidiagrama.", catalogError);
          setConnectionCatalogStatus("error");
          setConnectionCatalogError(
            catalogError instanceof Error ? catalogError : new Error(String(catalogError)),
          );
        });
    }
    return project;
  }, [activeProject, repository]);

  const renameDiagram = useCallback(async (diagramId, name) => {
    if (!activeProject) return null;
    const trimmed = String(name || "").trim() || "Diagrama sin nombre";
    const updated = await repository.renameDiagram(activeProject.id, diagramId, trimmed);
    setActiveProject((current) => current?.id === activeProject.id
      ? {
          ...current,
          diagrams: current.diagrams.map((sheet) => sheet.id === diagramId
            ? {
                ...sheet,
                name: trimmed,
                updatedAt: updated.updatedAt ?? new Date().toISOString(),
                document: sheet.document ? { ...sheet.document, name: trimmed } : null,
              }
            : sheet),
        }
      : current);
    return updated;
  }, [activeProject, repository]);

  const duplicateDiagram = useCallback(async (diagramId) => {
    if (!activeProject) return null;
    const copy = await repository.duplicateDiagram(activeProject, diagramId);
    setActiveProject((current) => current?.id === activeProject.id
      ? {
          ...current,
          activeDiagramId: copy.id,
          diagrams: [...current.diagrams, copy],
          cloudRecord: {
            ...current.cloudRecord,
            activeDiagramId: copy.id,
            diagramCount: current.diagrams.length + 1,
          },
        }
      : current);
    await refreshSummaries();
    return copy;
  }, [activeProject, refreshSummaries, repository]);

  const deleteDiagram = useCallback(async (diagramId) => {
    if (!activeProject) return false;
    const nextActiveId = await repository.deleteDiagram(activeProject, diagramId);
    const updated = await repository.get(activeProject.id, { loadDiagramId: nextActiveId });
    setActiveProject(updated);
    await refreshSummaries();
    return true;
  }, [activeProject, refreshSummaries, repository]);

  const moveDiagram = useCallback(async (diagramId, direction) => {
    if (!activeProject) return null;
    const diagrams = await repository.moveDiagram(activeProject, diagramId, direction);
    setActiveProject((current) => current?.id === activeProject.id ? { ...current, diagrams } : current);
    return diagrams;
  }, [activeProject, repository]);

  const deleteProject = useCallback(async (id) => {
    if (!activeProject || activeProject.id !== id) return false;
    await repository.deleteProject(activeProject);
    setActiveProject(null);
    await refreshSummaries();
    routeToWorkspace();
    return true;
  }, [activeProject, refreshSummaries, repository]);

  const inviteMember = useCallback(async ({ email, role }) => {
    if (!activeProject) return null;
    const invitation = await repository.invite(activeProject, { email, role });
    setActiveProject((current) => {
      if (current?.id !== activeProject.id) return current;
      const pendingMember = {
        id: `invitation:${invitation.id}`,
        invitationId: invitation.id,
        displayName: invitation.email,
        email: invitation.email,
        role: String(invitation.role).toLowerCase(),
        status: "pending",
        expiresAt: invitation.expiresAt,
        emailDeliveryStatus: invitation.emailDeliveryStatus,
        emailSentAt: invitation.emailSentAt,
        emailError: invitation.emailError,
        sendCount: invitation.sendCount,
      };
      const memberExists = current.members.some((item) => item.invitationId === invitation.id);
      const invitationExists = (current.invitations ?? []).some((item) => item.id === invitation.id);
      return {
        ...current,
        members: memberExists
          ? current.members.map((item) => item.invitationId === invitation.id ? { ...item, ...pendingMember } : item)
          : [...current.members, pendingMember],
        invitations: invitationExists
          ? current.invitations.map((item) => item.id === invitation.id ? { ...item, ...invitation } : item)
          : [...(current.invitations ?? []), invitation],
      };
    });
    return invitation;
  }, [activeProject, repository]);

  const resendInvitation = useCallback(async (invitationId) => {
    if (!activeProject) return null;
    const invitation = await repository.resendInvitation(activeProject, invitationId);
    setActiveProject((current) => {
      if (current?.id !== activeProject.id) return current;
      return {
        ...current,
        invitations: (current.invitations ?? []).map((item) => item.id === invitation.id ? { ...item, ...invitation } : item),
        members: current.members.map((item) => item.invitationId === invitation.id ? {
          ...item,
          expiresAt: invitation.expiresAt,
          emailDeliveryStatus: invitation.emailDeliveryStatus,
          emailSentAt: invitation.emailSentAt,
          emailError: invitation.emailError,
          sendCount: invitation.sendCount,
        } : item),
      };
    });
    return invitation;
  }, [activeProject, repository]);

  const acceptInvitation = useCallback(async (invitationId) => {
    await repository.acceptInvitation(invitationId);
    await Promise.all([refreshSummaries(), refreshInvitations()]);
    return true;
  }, [refreshInvitations, refreshSummaries, repository]);

  const openProjectSettings = useCallback(() => setProjectSettingsOpen(true), []);
  const closeProjectSettings = useCallback(() => setProjectSettingsOpen(false), []);
  const openCreateProject = useCallback(() => setCreateProjectOpen(true), []);
  const closeCreateProject = useCallback(() => setCreateProjectOpen(false), []);
  const openInviteMembers = useCallback(() => setInviteMembersOpen(true), []);
  const closeInviteMembers = useCallback(() => setInviteMembersOpen(false), []);
  const openShareProject = useCallback(() => setShareProjectOpen(true), []);
  const closeShareProject = useCallback(() => setShareProjectOpen(false), []);

  const actions = useMemo(() => ({
    refreshSummaries,
    loadProject,
    createProject,
    openWorkspace,
    openProject,
    openProjectEditor,
    returnToProject,
    closeProject,
    goHome,
    updateProject,
    refreshProjectConnectionCatalog,
    prepareProjectAnalysis,
    saveDraft,
    saveDiagramDocument,
    checkForRemoteChanges,
    reloadActiveDiagramFromCloud,
    createDiagram,
    selectDiagram,
    renameDiagram,
    duplicateDiagram,
    deleteDiagram,
    moveDiagram,
    deleteProject,
    inviteMember,
    resendInvitation,
    acceptInvitation,
    refreshInvitations,
    openProjectSettings,
    closeProjectSettings,
    openCreateProject,
    closeCreateProject,
    openInviteMembers,
    closeInviteMembers,
    openShareProject,
    closeShareProject,
    signOut,
  }), [
    refreshSummaries,
    loadProject,
    createProject,
    openWorkspace,
    openProject,
    openProjectEditor,
    returnToProject,
    closeProject,
    goHome,
    updateProject,
    refreshProjectConnectionCatalog,
    prepareProjectAnalysis,
    saveDraft,
    saveDiagramDocument,
    checkForRemoteChanges,
    reloadActiveDiagramFromCloud,
    createDiagram,
    selectDiagram,
    renameDiagram,
    duplicateDiagram,
    deleteDiagram,
    moveDiagram,
    deleteProject,
    inviteMember,
    resendInvitation,
    acceptInvitation,
    refreshInvitations,
    openProjectSettings,
    closeProjectSettings,
    openCreateProject,
    closeCreateProject,
    openInviteMembers,
    closeInviteMembers,
    openShareProject,
    closeShareProject,
    signOut,
  ]);

  const value = useMemo(() => ({
    projectSummaries,
    myInvitations,
    activeProject,
    activeDiagram: activeProject?.diagrams.find((sheet) => sheet.id === activeProject.activeDiagramId) ?? null,
    status,
    error,
    session,
    profile,
    workspace,
    projectSettingsOpen,
    createProjectOpen,
    inviteMembersOpen,
    shareProjectOpen,
    connectionCatalogStatus,
    connectionCatalogProgress,
    connectionCatalogError,
    actions,
  }), [
    projectSummaries,
    myInvitations,
    activeProject,
    status,
    error,
    session,
    profile,
    workspace,
    projectSettingsOpen,
    createProjectOpen,
    inviteMembersOpen,
    shareProjectOpen,
    connectionCatalogStatus,
    connectionCatalogProgress,
    connectionCatalogError,
    actions,
  ]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace debe utilizarse dentro de WorkspaceProvider.");
  return context;
}
