import { useState } from "react";

export default function AsyncActionButton({ onAction, idleLabel, busyLabel = "Procesando…", children, disabled, ...props }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      await onAction?.();
    } finally {
      setBusy(false);
    }
  };
  return (
    <button {...props} type={props.type ?? "button"} disabled={disabled || busy} onClick={run}>
      {busy ? busyLabel : (children ?? idleLabel)}
    </button>
  );
}
