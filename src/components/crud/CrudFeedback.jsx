export default function CrudFeedback({ loading = false, error = null, empty = false, children }) {
  if (loading) return <div className="crud-feedback"><span className="session-loader" /><strong>Cargando información…</strong></div>;
  if (error) return <div className="crud-feedback crud-feedback--error"><strong>No se pudo completar la operación</strong><span>{error instanceof Error ? error.message : String(error)}</span></div>;
  if (empty) return <div className="crud-feedback">{children}</div>;
  return children;
}
