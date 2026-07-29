import { useEffect } from "react";
import { useEditorActions, useEditorSelector } from "../../editor/EditorContext.jsx";

export default function NoticeToast() {
  const notice = useEditorSelector((state) => state.ui.notice);
  const actions = useEditorActions();

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(actions.clearNotice, 4200);
    return () => window.clearTimeout(timer);
  }, [actions, notice]);

  if (!notice) return null;
  return (
    <button className={`notice-toast notice-toast--${notice.tone}`} onClick={actions.clearNotice}>
      {notice.message}
    </button>
  );
}
