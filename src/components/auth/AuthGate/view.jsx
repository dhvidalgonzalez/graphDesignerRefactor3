export default function AuthGateView({ children }) {
  return (
    <div className="auth-page">
      <aside className="auth-brand-panel">
        <a className="landing-brand auth-brand" href="#/">
          <span className="brand-mark">GD</span>
          <span><strong>Graph Designer</strong><small>Diagramas eléctricos</small></span>
        </a>
        <div>
          <span className="hero-kicker">Tu espacio de trabajo eléctrico</span>
          <h1>Continúa con tus proyectos eléctricos.</h1>
          <p>Accede a tus diagramas, hojas y proyectos compartidos desde una sesión protegida.</p>
        </div>
        <small>Tus proyectos se guardan de forma segura y permanecen disponibles entre sesiones.</small>
      </aside>
      <main className="auth-form-panel">{children}</main>
    </div>
  );
}
