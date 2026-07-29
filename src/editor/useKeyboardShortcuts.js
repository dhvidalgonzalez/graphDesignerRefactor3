import { useEffect } from "react";
import { useEditorActions } from "./EditorContext.jsx";

function isEditableTarget(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

export function useKeyboardShortcuts() {
  const actions = useEditorActions();

  useEffect(() => {
    const onKeyDown = (event) => {
      if (isEditableTarget(event.target)) return;
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) actions.redo();
        else actions.undo();
        return;
      }
      if (command && event.key.toLowerCase() === "y") {
        event.preventDefault();
        actions.redo();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        actions.deleteSelection();
        return;
      }
      if (event.key === "Escape") {
        actions.cancelConnection();
        actions.closeElectricalEditor();
        actions.clearSelection();
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "v") actions.setTool("select");
      if (key === "p" || key === "c") actions.setTool("path");
      if (key === "l") actions.setTool("line");
      if (key === "e") actions.setTool("electrical");
      if (key === "h") actions.setTool("pan");
      if (key === "r") actions.rotateSelection(45);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actions]);
}
