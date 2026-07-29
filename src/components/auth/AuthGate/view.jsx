export default function AuthGateView({ children }) {
  return (
    <div className="auth-page">
      <aside className="auth-brand-panel">
        <a className="landing-brand auth-brand" href="#/">
          <span className="brand-mark">GD</span>
          <span><strong>Graph Designer</strong><small>Diagramas eléctricos</small></span>
        </a>
        <div>
          <span className="hero-kicker">Tu espacio técnico en la nube</span>
          <h1>Continúa con tus proyectos eléctricos.</h1>
          <p>Accede a diagramas, hojas y colaboradores desde una sesión protegida por Amazon Cognito.</p>
        </div>
        <small>Los documentos gráficos se almacenan como JSON versionados en S3.</small>
      </aside>
      <main className="auth-form-panel">{children}</main>
    </div>
  );
}
