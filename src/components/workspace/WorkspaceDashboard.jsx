import { useMemo, useState } from "react";
import Icon from "../common/Icon.jsx";
import { formatDate } from "../../utils/format.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.jsx";

export default function WorkspaceDashboard() {
  const { projectSummaries, myInvitations, status, actions } = useWorkspace();
  const [query, setQuery] = useState("");
  const [view, setView] = useState("grid");
  const [acceptingId, setAcceptingId] = useState(null);

  const visibleProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return projectSummaries;
    return projectSummaries.filter((project) => `${project.name} ${project.description}`.toLowerCase().includes(normalized));
  }, [projectSummaries, query]);

  return (
    <div className="workspace-content-scroll">
      <header className="workspace-content-header">
        <div>
          <span className="workspace-kicker">Tus espacios de trabajo</span>
          <h1>Mis proyectos</h1>
          <p>Administra tus proyectos eléctricos y entra a sus diagramas cuando estés listo para editar.</p>
        </div>
        <button className="button button--primary workspace-primary-action" type="button" onClick={actions.openCreateProject}>
          <Icon name="plus" size={16} /> Nuevo proyecto
        </button>
      </header>

      {myInvitations.length > 0 && (
        <section className="workspace-invitations-panel">
          <div><span className="workspace-summary-icon"><Icon name="users" size={18} /></span><div><strong>Invitaciones pendientes</strong><small>Proyectos que otras personas compartieron contigo.</small></div></div>
          <div className="workspace-invitation-list">
            {myInvitations.map((invitation) => (
              <article key={invitation.id}>
                <span><strong>{invitation.projectName}</strong><small>{invitation.invitedByDisplayName} · {String(invitation.role).toLowerCase() === "editor" ? "puede editar" : "sólo lectura"}</small></span>
                <button
                  className="button button--primary"
                  type="button"
                  disabled={acceptingId === invitation.id}
                  onClick={async () => {
                    setAcceptingId(invitation.id);
                    try {
                      await actions.acceptInvitation(invitation.id);
                    } catch (error) {
                      window.alert(error instanceof Error ? error.message : "No se pudo aceptar la invitación.");
                    } finally {
                      setAcceptingId(null);
                    }
                  }}
                >{acceptingId === invitation.id ? "Aceptando…" : "Aceptar"}</button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="workspace-summary-strip">
        <article><span className="workspace-summary-icon"><Icon name="folder" size={19} /></span><div><strong>{projectSummaries.length}</strong><small>Proyectos</small></div></article>
        <article><span className="workspace-summary-icon"><Icon name="file" size={19} /></span><div><strong>{projectSummaries.reduce((sum, project) => sum + project.diagramCount, 0)}</strong><small>Diagramas</small></div></article>
        <article><span className="workspace-summary-icon"><Icon name="users" size={19} /></span><div><strong>{projectSummaries.reduce((sum, project) => sum + project.memberCount, 0)}</strong><small>Accesos registrados</small></div></article>
      </section>

      <section className="workspace-projects-panel">
        <div className="workspace-list-toolbar">
          <div>
            <h2>Todos los proyectos</h2>
            <span>{visibleProjects.length} resultados</span>
          </div>
          <div className="workspace-list-controls">
            <label className="workspace-search">
              <Icon name="search" size={15} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar proyecto" />
            </label>
            <div className="workspace-view-toggle" aria-label="Vista">
              <button className={view === "grid" ? "active" : ""} type="button" onClick={() => setView("grid")} title="Vista de cuadrícula"><Icon name="grid" size={15} /></button>
              <button className={view === "list" ? "active" : ""} type="button" onClick={() => setView("list")} title="Vista de lista"><Icon name="list" size={15} /></button>
            </div>
          </div>
        </div>

        {status === "loading" ? (
          <div className="workspace-empty-state"><span className="session-loader" /><h3>Cargando proyectos</h3><p>Consultando tu espacio de trabajo en DynamoDB.</p></div>
        ) : visibleProjects.length ? (
          <div className={`workspace-project-collection workspace-project-collection--${view}`}>
            {visibleProjects.map((project) => (
              <article className="workspace-project-card" key={project.id}>
                <button className="workspace-project-card-main" type="button" onClick={() => actions.openProject(project.id)}>
                  <span className="workspace-project-thumbnail">
                    <svg viewBox="0 0 180 105" aria-hidden="true">
                      <path d="M18 29h45v24h45v25h54" />
                      <circle cx="63" cy="53" r="8" />
                      <circle cx="79" cy="53" r="8" />
                      <path className="mini-bus" d="M111 78h50" />
                    </svg>
                  </span>
                  <span className="workspace-project-card-copy">
                    <strong>
                      {project.name}
                      {project.multiDiagram && <span className="multi-diagram-inline-badge">Multidiagrama</span>}
                    </strong>
                    <small>{project.description || "Proyecto de diagramas eléctricos"}</small>
                  </span>
                </button>
                <div className="workspace-project-card-meta">
                  <span><Icon name="file" size={12} /> {project.diagramCount} {project.diagramCount === 1 ? "diagrama" : "diagramas"}</span>
                  <span><Icon name="users" size={12} /> {project.memberCount}</span>
                  <span><Icon name="clock" size={12} /> {formatDate(project.updatedAt)}</span>
                </div>
                <div className="workspace-project-card-footer">
                  <button className="button button--soft" type="button" onClick={() => actions.openProject(project.id)}>Ver proyecto</button>
                  <button className="workspace-quiet-icon" type="button" title="Más opciones"><Icon name="dots" size={17} /></button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="workspace-empty-state">
            <span><Icon name={projectSummaries.length ? "search" : "folder"} size={26} /></span>
            <h3>{projectSummaries.length ? "No encontramos proyectos" : "Crea tu primer proyecto"}</h3>
            <p>{projectSummaries.length ? "Prueba con otro nombre o limpia la búsqueda." : "Tu espacio de trabajo reunirá aquí todos los proyectos y diagramas eléctricos."}</p>
            {!projectSummaries.length && <button className="button button--primary" type="button" onClick={actions.openCreateProject}>Crear proyecto</button>}
          </div>
        )}
      </section>
    </div>
  );
}
