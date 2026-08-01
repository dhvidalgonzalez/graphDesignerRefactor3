import { useEffect, useRef, useState } from "react";
import { useEditorActions, useEditorSelector, useEditorStore } from "../../editor/EditorContext.jsx";
import { useWorkspace } from "../../workspace/WorkspaceContext.jsx";

export default function DiagramTabsBar() {
  const { activeProject, activeDiagram, actions } = useWorkspace();
  const store = useEditorStore();
  const editorActions = useEditorActions();
  const persistence = useEditorSelector((state) => state.persistence);
  const zoom = useEditorSelector((state) => state.viewport.scale);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menuOpen]);

  if (!activeProject || !activeDiagram) return null;

  const persistDraftOnly = () => {
    if (!activeProject.canEdit) return;
    actions.saveDraft(
      activeProject.id,
      activeDiagram.id,
      store.getState().document,
    );
    if (persistence.status !== "saved") {
      editorActions.setPersistence(
        "dirty",
        "Borrador local · pendiente de sincronizar",
      );
    }
  };

  const syncCurrentForCopy = async () => {
    persistDraftOnly();
    if (!activeProject.canEdit || persistence.status === "saved") return;
    editorActions.setPersistence("saving", "Guardando cambios…");
    await actions.saveDiagramDocument(
      activeProject.id,
      activeDiagram.id,
      store.getState().document,
    );
    editorActions.setPersistence("saved", "Cambios guardados");
  };

  const run = async (task) => {
    if (busy) return;
    setBusy(true);
    try {
      await task();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "La operación no pudo completarse.");
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (diagramId) => run(async () => {
    if (diagramId === activeDiagram.id) return;
    persistDraftOnly();
    await actions.selectDiagram(diagramId);
  });

  const beginRename = (sheet) => {
    if (!activeProject.canEdit) return;
    setEditingId(sheet.id);
    setDraftName(sheet.name);
    setMenuOpen(false);
  };

  const finishRename = async () => {
    if (!editingId) return;
    const nextName = draftName.trim() || "Diagrama sin nombre";
    setEditingId(null);
    await run(async () => {
      await actions.renameDiagram(editingId, nextName);
      if (editingId === activeDiagram.id) store.actions.updateDocumentName(nextName);
    });
  };

  const activeIndex = activeProject.diagrams.findIndex((sheet) => sheet.id === activeDiagram.id);

  return (
    <footer className="diagram-tabs-bar">
      {activeProject.canEdit && (
        <button
          className="new-sheet-button"
          type="button"
          title="Crear diagrama vacío"
          disabled={busy}
          onClick={() => run(async () => { persistDraftOnly(); await actions.createDiagram(); })}
        >
          <span>＋</span> Nuevo diagrama
        </button>
      )}

      <div className="diagram-tabs-scroll" role="tablist" aria-label="Diagramas del proyecto">
        {activeProject.diagrams.map((sheet) => {
          const active = sheet.id === activeDiagram.id;
          return (
            <div className={`diagram-tab ${active ? "diagram-tab--active" : ""}`} key={sheet.id}>
              {editingId === sheet.id ? (
                <input
                  className="diagram-tab-input"
                  autoFocus
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  onBlur={finishRename}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") setEditingId(null);
                  }}
                />
              ) : (
                <button
                  className="diagram-tab-label"
                  type="button"
                  role="tab"
                  disabled={busy}
                  aria-selected={active}
                  onClick={() => switchTo(sheet.id)}
                  onDoubleClick={() => beginRename(sheet)}
                  title={`${sheet.name}${activeProject.canEdit ? " · doble clic para renombrar" : " · sólo lectura"}`}
                >
                  <span className="sheet-glyph">▤</span>
                  <span>{sheet.name}</span>
                  {active && ["dirty", "error", "conflict"].includes(persistence.status) && (
                    <i
                      className={`unsaved-mark ${persistence.status === "conflict" ? "unsaved-mark--conflict" : ""}`}
                      title={persistence.status === "conflict" ? "Existe una versión más reciente del diagrama" : "Cambios pendientes"}
                    />
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {activeProject.canEdit && (
        <div className="diagram-tab-menu-wrap" ref={menuRef}>
          <button className="sheet-menu-button" type="button" disabled={busy} onClick={() => setMenuOpen((value) => !value)} title="Opciones de la hoja activa">⋯</button>
          {menuOpen && (
            <div className="sheet-menu-popover">
              <button type="button" onClick={() => beginRename(activeDiagram)}>Renombrar hoja</button>
              <button type="button" onClick={() => run(async () => { await syncCurrentForCopy(); await actions.duplicateDiagram(activeDiagram.id); setMenuOpen(false); })}>Duplicar hoja</button>
              <div className="sheet-menu-separator" />
              <button type="button" disabled={activeIndex === 0} onClick={() => run(async () => { persistDraftOnly(); await actions.moveDiagram(activeDiagram.id, -1); setMenuOpen(false); })}>Mover a la izquierda</button>
              <button type="button" disabled={activeIndex === activeProject.diagrams.length - 1} onClick={() => run(async () => { persistDraftOnly(); await actions.moveDiagram(activeDiagram.id, 1); setMenuOpen(false); })}>Mover a la derecha</button>
              <div className="sheet-menu-separator" />
              <button
                className="sheet-menu-danger"
                type="button"
                disabled={activeProject.diagrams.length <= 1}
                onClick={() => {
                  if (window.confirm(`¿Eliminar la hoja “${activeDiagram.name}” y su archivo asociado?`)) {
                    run(async () => { await actions.deleteDiagram(activeDiagram.id); setMenuOpen(false); });
                  }
                }}
              >Eliminar hoja</button>
            </div>
          )}
        </div>
      )}

      <div className="diagram-footer-status">
        {!activeProject.canEdit && <span className="read-only-chip">Sólo lectura</span>}
        <span className={`save-status save-status--${persistence.status}`} title={persistence.message}><span className="status-dot" /> {activeProject.canEdit ? persistence.message : "Sin permisos de edición"}</span>
        <span className="footer-divider" />
        <span>Zoom {Math.round(zoom * 25)}%</span>
      </div>
    </footer>
  );
}
