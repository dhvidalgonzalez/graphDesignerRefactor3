import { useEffect, useRef, useState } from "react";
import Icon from "../common/Icon.jsx";
import DiagramExportModal from "../modals/DiagramExportModal.jsx";
import {
  useEditorActions,
  useEditorSelector,
  useEditorStore,
} from "../../editor/EditorContext.jsx";
import { parseAndMigrateDiagram } from "../../domain/diagram/migrateDiagram.js";
import { serializeDiagram } from "../../domain/diagram/serialization.js";
import { downloadTextFile, safeFilename } from "../../utils/download.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.jsx";

function hasPendingCloudChanges(status) {
  return status === "dirty" || status === "error" || status === "saving" || status === "conflict";
}

export default function HeaderBar() {
  const diagramDocument = useEditorSelector((state) => state.document);
  const persistence = useEditorSelector((state) => state.persistence);
  const rightPanelMode = useEditorSelector((state) => state.ui.rightPanelMode);
  const store = useEditorStore();
  const editorActions = useEditorActions();
  const { activeProject, activeDiagram, actions: workspaceActions } = useWorkspace();
  const fileInputRef = useRef(null);
  const [name, setName] = useState(diagramDocument.name);
  const [leaving, setLeaving] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => setName(diagramDocument.name), [diagramDocument.name]);

  const saveDraft = () => {
    if (!activeProject || !activeDiagram || !activeProject.canEdit) return;
    workspaceActions.saveDraft(
      activeProject.id,
      activeDiagram.id,
      store.getState().document,
    );
  };

  const syncNow = async () => {
    if (!activeProject || !activeDiagram || !activeProject.canEdit) return;
    if (store.getState().persistence.status === "conflict") {
      throw new Error("Existe una versión más reciente del diagrama. Recárgala antes de volver a guardar.");
    }

    const currentDocument = store.getState().document;
    workspaceActions.saveDraft(activeProject.id, activeDiagram.id, currentDocument);

    if (!hasPendingCloudChanges(store.getState().persistence.status)) return;

    editorActions.setPersistence("saving", "Guardando cambios…");

    try {
      await workspaceActions.saveDiagramDocument(
        activeProject.id,
        activeDiagram.id,
        currentDocument,
      );
      editorActions.setPersistence("saved", "Cambios guardados");
    } catch (error) {
      workspaceActions.saveDraft(
        activeProject.id,
        activeDiagram.id,
        store.getState().document,
      );
      if (error?.code === "REMOTE_VERSION_CHANGED") {
        editorActions.setPersistence(
          "conflict",
          "Hay una versión más reciente del diagrama",
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
      throw error;
    }
  };

  const reloadRemote = async () => {
    if (!activeProject || !activeDiagram) return;
    const pending = hasPendingCloudChanges(store.getState().persistence.status);
    if (pending) {
      const confirmed = window.confirm(
        "Hay cambios locales y una versión más reciente del diagrama.\n\nAl continuar se descartará el borrador local de esta hoja y se cargará la versión guardada.",
      );
      if (!confirmed) return;
    }
    await workspaceActions.reloadActiveDiagramFromCloud(
      activeProject.id,
      activeDiagram.id,
    );
  };

  const returnToProject = async () => {
    if (leaving) return;
    setLeaving(true);

    try {
      saveDraft();

      if (
        activeProject?.canEdit &&
        hasPendingCloudChanges(store.getState().persistence.status)
      ) {
        if (store.getState().persistence.status === "conflict") {
          const loadCloud = window.confirm(
            "Otra persona guardó una versión más reciente.\n\nAceptar: cargar la versión guardada.\nCancelar: conservar el borrador local y salir sin sobrescribirla.",
          );
          if (loadCloud) await reloadRemote();
        } else {
          const shouldSync = window.confirm(
            "Hay cambios pendientes de sincronización.\n\nAceptar: guardar los cambios ahora.\nCancelar: conservar sólo el borrador local y salir.",
          );

          if (shouldSync) {
            await syncNow();
          } else {
            editorActions.setPersistence(
              "dirty",
              "Borrador local · pendiente de sincronizar",
            );
          }
        }
      }

      workspaceActions.returnToProject();
    } catch (error) {
      window.alert(
        `${error instanceof Error ? error.message : "No se pudo guardar"}\n\nEl borrador local quedó conservado.`,
      );
    } finally {
      setLeaving(false);
    }
  };

  const importFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !activeProject?.canEdit) return;

    try {
      const imported = parseAndMigrateDiagram(await file.text());
      imported.id = activeDiagram?.id ?? imported.id;
      editorActions.loadDocument(imported);
      editorActions.setPersistence(
        "dirty",
        "Importado · borrador local pendiente",
      );
    } catch (error) {
      window.alert(
        `No se pudo importar el diagrama.\n\n${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const canEdit = activeProject?.canEdit ?? false;
  const canManage = activeProject?.canManage ?? false;
  const saving = persistence.status === "saving";
  const remoteAvailable = activeProject?.remoteUpdateAvailable?.diagramId === activeDiagram?.id;

  return (
    <>
      <header className="header-bar">
        <div className="editor-project-identity">
          <button
            className="editor-back-button"
            type="button"
            disabled={leaving || saving}
            title="Volver al resumen del proyecto"
            onClick={returnToProject}
          >
            <Icon name="arrowLeft" size={16} />
          </button>
          <div className="brand-mark">GD</div>
          <button
            className="project-breadcrumb"
            type="button"
            disabled={leaving || saving}
            onClick={returnToProject}
            title="Volver al proyecto"
          >
            <small>
              Proyecto · {activeProject?.role === "owner"
                ? "propietario"
                : activeProject?.role === "editor"
                  ? "editor"
                  : "lector"}
            </small>
            <strong>
              {activeProject?.name ?? "Proyecto"}
              {activeProject?.multiDiagram && <span className="multi-diagram-inline-badge">Multidiagrama</span>}
            </strong>
          </button>
        </div>

        <div className="diagram-title-control">
          <span>Hoja activa</span>
          <input
            className="diagram-name-input"
            aria-label="Nombre del diagrama"
            value={name}
            disabled={!canEdit}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => {
              const trimmed = name.trim() || "Diagrama sin nombre";
              setName(trimmed);
              if (trimmed !== diagramDocument.name) {
                editorActions.updateDocumentName(trimmed);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </div>

        <div className="header-actions">
          {remoteAvailable && (
            <button
              className="button remote-update-button"
              type="button"
              disabled={saving}
              onClick={() => reloadRemote().catch((error) => window.alert(error.message))}
              title="Otra persona guardó una versión más reciente"
            >
              <span className="status-dot" /> Nueva versión
            </button>
          )}

          {canEdit && (
            <>
              <button
                className="button button--ghost button--icon"
                onClick={editorActions.undo}
                disabled={!store.actions.canUndo() || saving}
                title="Deshacer (Ctrl+Z)"
              >
                ↶
              </button>
              <button
                className="button button--ghost button--icon"
                onClick={editorActions.redo}
                disabled={!store.actions.canRedo() || saving}
                title="Rehacer (Ctrl+Y)"
              >
                ↷
              </button>
              <button
                className="button button--primary editor-save-button"
                type="button"
                disabled={saving || persistence.status === "saved" || persistence.status === "conflict"}
                onClick={() => syncNow().catch((error) => {
                  window.alert(error instanceof Error ? error.message : "No se pudo guardar.");
                })}
              >
                {saving ? <span className="inline-spinner" /> : <Icon name="save" size={14} />}
                <span>{saving ? "Guardando…" : "Guardar"}</span>
              </button>
            </>
          )}

          <button
            className={`button analysis-header-button ${rightPanelMode === "analysis" ? "analysis-header-button--active" : "button--ghost"}`}
            type="button"
            onClick={editorActions.openAnalysisPanel}
            title="Abrir el centro de análisis y mantener el resumen lateral"
          >
            <Icon name="spark" size={14} /> <span>Análisis</span>
          </button>

          <button
            className="button button--soft"
            type="button"
            onClick={() => setExportOpen(true)}
            title="Exportar la vista como imagen o PDF"
          >
            <Icon name="download" size={14} /> <span>Imagen / PDF</span>
          </button>

          <details className="json-actions-menu">
            <summary className="button button--ghost" title="Importar o exportar datos JSON">JSON ▾</summary>
            <div className="json-actions-popover">
              {canEdit && (
                <button type="button" disabled={saving} onClick={() => fileInputRef.current?.click()}>
                  Importar JSON
                </button>
              )}
              <button
                type="button"
                onClick={() => downloadTextFile(
                  `${safeFilename(diagramDocument.name)}.json`,
                  serializeDiagram(diagramDocument),
                )}
              >
                Exportar JSON
              </button>
            </div>
          </details>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={importFile}
          />

          {canManage && (
            <button
              className="button button--ghost editor-share-button"
              type="button"
              onClick={workspaceActions.openShareProject}
              title="Compartir proyecto"
            >
              <Icon name="share" size={14} /> <span>Compartir</span>
            </button>
          )}

          {canManage && (
            <button
              className="button button--primary"
              onClick={workspaceActions.openProjectSettings}
            >
              <Icon name="settings" size={14} /> <span>Proyecto</span>
            </button>
          )}

          {!canEdit && <span className="read-only-chip">Sólo lectura</span>}
        </div>
      </header>

      <DiagramExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        documentName={diagramDocument.name}
      />
    </>
  );
}
