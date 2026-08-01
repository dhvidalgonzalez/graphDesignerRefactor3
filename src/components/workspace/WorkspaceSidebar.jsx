import Icon from "../common/Icon.jsx";
import { getInitials } from "../../utils/format.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.jsx";

export default function WorkspaceSidebar({ selectedProjectId, billing = false, examples = false }) {
  const { projectSummaries, profile, session, actions } = useWorkspace();
  const sharedCount = projectSummaries.filter((project) => project.shared).length;

  return (
    <aside className="workspace-sidebar">
      <button className="workspace-brand" type="button" onClick={actions.goHome}>
        <span className="brand-mark">GD</span>
        <span><strong>Graph Designer</strong><small>Diagramas eléctricos</small></span>
      </button>

      <button className="workspace-new-project" type="button" onClick={actions.openCreateProject}>
        <Icon name="plus" size={16} /> Nuevo proyecto
      </button>

      <nav className="workspace-navigation" aria-label="Espacios de trabajo">
        <span className="workspace-nav-label">Espacios de trabajo</span>
        <button
          className={!selectedProjectId && !billing && !examples ? "active" : ""}
          type="button"
          onClick={actions.openWorkspace}
        >
          <Icon name="dashboard" size={16} />
          <span>Mis proyectos</span>
          <strong>{projectSummaries.length}</strong>
        </button>

        <button
          className={examples ? "active" : ""}
          type="button"
          onClick={actions.openExamples}
        >
          <Icon name="spark" size={16} />
          <span>Ejemplos</span>
        </button>

        <span className="workspace-nav-label workspace-nav-label--projects">Proyectos</span>
        <div className="workspace-project-links">
          {projectSummaries.map((project) => (
            <button
              className={selectedProjectId === project.id ? "active" : ""}
              type="button"
              key={project.id}
              onClick={() => actions.openProject(project.id)}
              title={`${project.name}${project.shared ? " · compartido" : ""}`}
            >
              <span className="project-link-mark">⌁</span>
              <span>{project.name}</span>
              {project.shared && <small className="project-link-shared">↗</small>}
            </button>
          ))}
          {!projectSummaries.length && <p className="workspace-sidebar-empty">Tus proyectos aparecerán aquí.</p>}
        </div>

        <div className="workspace-nav-information">
          <Icon name="users" size={16} />
          <span><strong>Compartidos conmigo</strong><small>{sharedCount ? `${sharedCount} disponibles` : "Sin proyectos compartidos"}</small></span>
        </div>

        <span className="workspace-nav-label workspace-nav-label--projects">Cuenta</span>
        <button
          className={billing ? "active" : ""}
          type="button"
          onClick={() => { window.location.hash = "#/workspace/billing"; }}
        >
          <Icon name="settings" size={16} />
          <span>Planes y facturación</span>
        </button>
      </nav>

      <div className="workspace-sidebar-footer">
        <div className="workspace-user-avatar">{getInitials(profile?.displayName || session?.email || "U")}</div>
        <span><strong>{profile?.displayName || "Usuario"}</strong><small>{session?.email}</small></span>
        <button type="button" title="Cerrar sesión" onClick={actions.signOut}><Icon name="external" size={16} /></button>
      </div>
    </aside>
  );
}
