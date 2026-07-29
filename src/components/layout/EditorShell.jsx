import DiagramCanvas from "../canvas/DiagramCanvas.jsx";
import PropertiesPanel from "../panels/PropertiesPanel.jsx";
import ReadOnlyPropertiesPanel from "../panels/ReadOnlyPropertiesPanel.jsx";
import AnalysisPanel from "../analysis/AnalysisPanel.jsx";
import HeaderBar from "../toolbar/HeaderBar.jsx";
import ToolBar from "../toolbar/ToolBar.jsx";
import DiagramTabsBar from "../project/DiagramTabsBar.jsx";
import VoltageLevelsModal from "../modals/VoltageLevelsModal.jsx";
import ElectricalPropertiesModal from "../modals/ElectricalPropertiesModal.jsx";
import NoticeToast from "../common/NoticeToast.jsx";
import { DiagramExportProvider } from "../../editor/DiagramExportContext.jsx";
import { useKeyboardShortcuts } from "../../editor/useKeyboardShortcuts.js";
import { useLocalAutosave } from "../../editor/useLocalAutosave.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.jsx";
import { useEditorSelector } from "../../editor/EditorContext.jsx";

function EditorShellContent() {
  const { activeProject } = useWorkspace();
  const rightPanelMode = useEditorSelector((state) => state.ui.rightPanelMode);
  useKeyboardShortcuts();
  useLocalAutosave();
  return (
    <div className={`editor-shell ${activeProject?.canEdit ? "" : "editor-shell--readonly"}`}>
      <HeaderBar />
      <ToolBar />
      {!activeProject?.canEdit && (
        <div className="editor-readonly-banner">
          Estás revisando este proyecto con permiso de sólo lectura. Puedes navegar, seleccionar, inspeccionar y exportar la vista, pero no modificarla.
        </div>
      )}
      <main className={`editor-main ${rightPanelMode === "analysis" ? "editor-main--analysis" : ""}`}>
        <DiagramCanvas />
        {rightPanelMode === "analysis"
          ? <AnalysisPanel />
          : activeProject?.canEdit ? <PropertiesPanel /> : <ReadOnlyPropertiesPanel />}
      </main>
      <DiagramTabsBar />
      <VoltageLevelsModal />
      <ElectricalPropertiesModal />
      <NoticeToast />
    </div>
  );
}

export default function EditorShell() {
  return (
    <DiagramExportProvider>
      <EditorShellContent />
    </DiagramExportProvider>
  );
}
