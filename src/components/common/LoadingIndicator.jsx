export default function LoadingIndicator({ label = "Cargando…", compact = false }) {
  return (
    <div className={`loading-indicator ${compact ? "loading-indicator--compact" : ""}`} role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
