import { useEffect, useRef } from "react";
import { useWorkspace } from "../workspace/WorkspaceContext.jsx";
import {
  useEditorActions,
  useEditorSelector,
  useEditorStore,
} from "./EditorContext.jsx";

const DRAFT_DELAY_MS = 300;
const CLOUD_INTERVAL_MS = 15 * 60 * 1000;
const REMOTE_CHECK_INTERVAL_MS = 60 * 1000;

function hasUnsyncedChanges(status) {
  return status === "dirty" || status === "error" || status === "saving" || status === "conflict";
}

export function useLocalAutosave() {
  const document = useEditorSelector((state) => state.document);
  const status = useEditorSelector((state) => state.persistence.status);
  const editorActions = useEditorActions();
  const store = useEditorStore();
  const syncInFlight = useRef(false);
  const remoteCheckInFlight = useRef(false);
  const { activeProject, activeDiagram, actions: workspaceActions } = useWorkspace();

  const projectId = activeProject?.id ?? null;
  const diagramId = activeDiagram?.id ?? null;
  const storageVersion = Number(activeDiagram?.storageVersion ?? 0);
  const canEdit = activeProject?.canEdit ?? false;

  useEffect(() => {
    if (status !== "dirty" || !projectId || !diagramId || !canEdit) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      workspaceActions.saveDraft(projectId, diagramId, document);
      editorActions.setPersistence(
        "dirty",
        "Borrador local · pendiente de sincronizar",
      );
    }, DRAFT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [
    canEdit,
    diagramId,
    document,
    editorActions,
    projectId,
    status,
    workspaceActions,
  ]);

  useEffect(() => {
    if (!projectId || !diagramId || !canEdit) return undefined;

    const syncIfNeeded = async () => {
      if (syncInFlight.current || globalThis.document?.visibilityState === "hidden") return;

      const state = store.getState();
      if (!hasUnsyncedChanges(state.persistence.status) || state.persistence.status === "conflict") return;

      syncInFlight.current = true;
      const capturedUpdatedAt = state.document.updatedAt;

      try {
        editorActions.setPersistence("saving", "Guardado automático en S3…");
        await workspaceActions.saveDiagramDocument(
          projectId,
          diagramId,
          state.document,
        );

        const current = store.getState();
        if (current.document.updatedAt === capturedUpdatedAt) {
          editorActions.setPersistence("saved", "Guardado en la nube");
        } else {
          workspaceActions.saveDraft(projectId, diagramId, current.document);
          editorActions.setPersistence(
            "dirty",
            "Cambios nuevos · borrador local",
          );
        }
      } catch (error) {
        workspaceActions.saveDraft(
          projectId,
          diagramId,
          store.getState().document,
        );
        if (error?.code === "REMOTE_VERSION_CHANGED") {
          editorActions.setPersistence(
            "conflict",
            "Hay una versión más reciente en la nube",
          );
          editorActions.setNotice(
            "Otra persona guardó una versión nueva. Recárgala antes de volver a sincronizar.",
            "warning",
          );
        } else {
          editorActions.setPersistence(
            "error",
            `${error instanceof Error ? error.message : "No se pudo sincronizar"} · borrador local conservado`,
          );
        }
      } finally {
        syncInFlight.current = false;
      }
    };

    const interval = window.setInterval(syncIfNeeded, CLOUD_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [
    canEdit,
    diagramId,
    editorActions,
    projectId,
    store,
    workspaceActions,
  ]);

  useEffect(() => {
    if (!projectId || !diagramId) return undefined;

    const checkRemote = async () => {
      if (remoteCheckInFlight.current || globalThis.document?.visibilityState === "hidden") return;
      remoteCheckInFlight.current = true;
      try {
        const remote = await workspaceActions.checkForRemoteChanges(
          projectId,
          diagramId,
          storageVersion,
        );
        if (!remote) return;

        const currentStatus = store.getState().persistence.status;
        if (!canEdit || !hasUnsyncedChanges(currentStatus)) {
          await workspaceActions.reloadActiveDiagramFromCloud(projectId, diagramId);
          return;
        }

        editorActions.setPersistence(
          "conflict",
          "Hay una versión más reciente en la nube",
        );
        editorActions.setNotice(
          "Otra persona guardó una versión nueva. Sincroniza o recarga antes de continuar.",
          "warning",
        );
      } catch (error) {
        console.warn("No fue posible comprobar cambios remotos del diagrama.", error);
      } finally {
        remoteCheckInFlight.current = false;
      }
    };

    const onFocus = () => checkRemote();
    const onVisibility = () => {
      if (globalThis.document?.visibilityState === "visible") checkRemote();
    };

    const initialCheck = window.setTimeout(checkRemote, 1200);
    const interval = window.setInterval(checkRemote, REMOTE_CHECK_INTERVAL_MS);
    window.addEventListener("focus", onFocus);
    globalThis.document?.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearTimeout(initialCheck);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      globalThis.document?.removeEventListener("visibilitychange", onVisibility);
    };
  }, [
    canEdit,
    diagramId,
    editorActions,
    projectId,
    storageVersion,
    store,
    workspaceActions,
  ]);

  useEffect(() => {
    if (!projectId || !diagramId || !canEdit) return undefined;

    const persistDraft = () => {
      workspaceActions.saveDraft(
        projectId,
        diagramId,
        store.getState().document,
      );
    };

    const beforeUnload = (event) => {
      persistDraft();
      if (!hasUnsyncedChanges(store.getState().persistence.status)) return;

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("pagehide", persistDraft);

    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("pagehide", persistDraft);
      persistDraft();
    };
  }, [canEdit, diagramId, projectId, store, workspaceActions]);
}
