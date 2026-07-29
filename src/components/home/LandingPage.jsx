import Icon from "../common/Icon.jsx";
export default function LandingPage() {
  const openWorkspace = () => { window.location.hash = "#/workspace"; };

  return (
    <div className="landing-page">
      <header className="landing-header">
        <a className="landing-brand" href="#/" aria-label="Graph Designer, inicio">
          <span className="brand-mark">GD</span>
          <span><strong>Graph Designer</strong><small>Diagramas eléctricos</small></span>
        </a>
        <nav className="landing-nav" aria-label="Navegación principal">
          <a href="#inicio">Inicio</a>
          <a href="#flujo">Flujo de trabajo</a>
          <a href="#capacidades">Capacidades</a>
        </nav>
        <button className="button button--primary landing-create-button" onClick={openWorkspace}>Empezar</button>
      </header>

      <main className="landing-main">
        <section className="landing-hero" id="inicio">
          <div className="hero-copy">
            <span className="hero-kicker">Editor unifilar local-first</span>
            <h1>Diseña, organiza y comunica una red eléctrica.</h1>
            <p>
              Crea proyectos eléctricos con múltiples hojas, símbolos reutilizables, conexiones inteligentes y una base preparada para colaboración.
            </p>
            <div className="hero-actions">
              <button className="button button--primary button--large" onClick={openWorkspace}>
                Ir a mis proyectos <Icon name="chevronRight" size={15} />
              </button>
              <a className="button button--soft button--large landing-demo-link" href="#flujo">Conocer el flujo</a>
            </div>
            <div className="hero-facts" id="capacidades">
              <span><strong>01</strong> Biblioteca eléctrica</span>
              <span><strong>02</strong> Proyectos con hojas</span>
              <span><strong>03</strong> Preparado para colaborar</span>
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="hero-window">
              <div className="hero-window-bar"><i /><i /><i /><span>Proyecto / Diagrama principal</span></div>
              <svg viewBox="0 0 620 330" role="img">
                <path d="M80 94 H270 V165 H420" />
                <path d="M270 165 V252 H500" />
                <path d="M420 165 V92 H545" />
                <circle cx="270" cy="165" r="19" />
                <circle cx="308" cy="165" r="19" />
                <rect x="67" y="82" width="26" height="26" rx="4" />
                <rect x="407" y="152" width="26" height="26" rx="4" />
                <path className="hero-bus" d="M465 252 H555" />
                <path d="M510 252 V292" />
                <path d="M495 292 H525 L510 316 Z" />
              </svg>
              <div className="hero-sheet-tabs"><span className="active">Diagrama principal</span><span>Protecciones</span><b>＋</b></div>
            </div>
          </div>
        </section>

        <section className="landing-flow" id="flujo">
          <div className="landing-section-heading">
            <span className="eyebrow">Un flujo directo, sin perder estructura</span>
            <h2>Del proyecto al diagrama en tres pasos.</h2>
            <p>La aplicación separa la gestión del trabajo de la edición gráfica, sin agregar capas innecesarias.</p>
          </div>
          <div className="landing-flow-grid">
            <article><span>01</span><Icon name="grid" size={22} /><h3>Espacios de trabajo</h3><p>Revisa todos tus proyectos, actividad reciente y accesos en una sola vista.</p></article>
            <article><span>02</span><Icon name="folder" size={22} /><h3>Proyecto eléctrico</h3><p>Organiza descripción, participantes y distintas vistas del circuito.</p></article>
            <article><span>03</span><Icon name="spark" size={22} /><h3>Editor de diagramas</h3><p>Abre únicamente la hoja que necesitas y trabaja con el canvas completo.</p></article>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <strong>Graph Designer</strong>
        <span>Prototipo cloud · autenticación, colaboración y documentos versionados</span>
      </footer>
    </div>
  );
}
