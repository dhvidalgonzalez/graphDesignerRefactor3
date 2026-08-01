import { useEffect, useState } from "react";
import Icon from "../common/Icon.jsx";
import { formatDate, getInitials } from "../../utils/format.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.jsx";

const ROLE_LABELS = { owner: "Propietario", editor: "Puede editar", viewer: "Sólo lectura" };

function DiagramPreview({ sheet }) {
  const nodeCount = Object.keys(sheet.document?.nodes ?? {}).length;
  const edgeCount = Object.keys(sheet.document?.edges ?? {}).length;
  return (
    <div className="project-diagram-preview" aria-hidden="true">
      <svg viewBox="0 0 240 130">
        <path d="M22 35h58v28h54v32h82" />
        <path d="M134 63v-31h64" />
        <circle cx="80" cy="63" r="10" />
        <circle cx="100" cy="63" r="10" />
        <path className="diagram-preview-bus" d="M151 95h66" />
      </svg>
      <span>{nodeCount} equipos · {edgeCount} conexiones</span>
    </div>
  );
}

export default function ProjectOverview() {
  const { activeProject, session, actions } = useWorkspace();
  const [tab, setTab] = useState("diagrams");

  useEffect(() => setTab("diagrams"), [activeProject?.id]);
  if (!activeProject) return null;

  return (
    <div className="workspace-content-scroll project-overview-page">
      <div className="project-overview-breadcrumb">
        <button type="button" onClick={actions.openWorkspace}>Mis proyectos</button>
        <Icon name="chevronRight" size={13} />
        <span>{activeProject.name}</span>
      </div>

      <section className="project-overview-hero">
        <div className="project-overview-mark">⌁</div>
        <div className="project-overview-title">
          <span className="workspace-kicker">Proyecto eléctrico</span>
          <h1>{activeProject.name}</h1>
          <p>{activeProject.description || "Este proyecto todavía no tiene una descripción. Puedes agregar alcance, ubicación y objetivos desde su configuración."}</p>
          <div className="project-overview-meta">
            <span><Icon name="clock" size={13} /> Actualizado {formatDate(activeProject.updatedAt, { withTime: true })}</span>
            <span><Icon name="file" size={13} /> {activeProject.diagrams.length} {activeProject.diagrams.length === 1 ? "diagrama" : "diagramas"}</span>
            <span><Icon name="users" size={13} /> {activeProject.members.length} {activeProject.members.length === 1 ? "participante" : "participantes"}</span>
          </div>
        </div>
        <div className="project-overview-actions">
          <button className="button button--soft" type="button" onClick={actions.openShareProject}><Icon name="share" size={15} /> Compartir</button>
          <button className="button button--soft" type="button" disabled title="La descarga completa del proyecto se habilitará más adelante"><Icon name="download" size={15} /> Descargar</button>
          <button className="button button--primary" type="button" onClick={() => actions.openProjectEditor(activeProject.id, activeProject.activeDiagramId).catch((error) => window.alert(error.message))}>
            Abrir editor <Icon name="external" size={14} />
          </button>
        </div>
      </section>

      <div className="project-overview-tabs" role="tablist" aria-label="Secciones del proyecto">
        <button className={tab === "diagrams" ? "active" : ""} type="button" onClick={() => setTab("diagrams")}><Icon name="file" size={15} /> Diagramas</button>
        <button className={tab === "people" ? "active" : ""} type="button" onClick={() => setTab("people")}><Icon name="users" size={15} /> Participantes</button>
        <button className={tab === "settings" ? "active" : ""} type="button" onClick={() => setTab("settings")}><Icon name="settings" size={15} /> Configuración</button>
      </div>

      {tab === "diagrams" && (
        <section className="project-overview-section">
          <div className="project-section-heading">
            <div><h2>Hojas del proyecto</h2><p>Cada hoja representa una vista independiente de la red y monta su propio editor al abrirse.</p></div>
            <button className="button button--soft" type="button" disabled={!activeProject.canEdit} onClick={() => actions.createDiagram().catch((error) => window.alert(error.message))}><Icon name="plus" size={15} /> Nuevo diagrama</button>
          </div>
          <div className="project-diagram-grid">
            {activeProject.diagrams.map((sheet) => (
              <article className={`project-diagram-card ${sheet.id === activeProject.activeDiagramId ? "project-diagram-card--active" : ""}`} key={sheet.id}>
                <button className="project-diagram-open" type="button" onClick={() => actions.openProjectEditor(activeProject.id, sheet.id).catch((error) => window.alert(error.message))}>
                  <DiagramPreview sheet={sheet} />
                  <span className="project-diagram-copy">
                    <strong>{sheet.name}</strong>
                    <small>Actualizado {formatDate(sheet.updatedAt)}</small>
                  </span>
                </button>
                <div className="project-diagram-card-footer">
                  {sheet.id === activeProject.activeDiagramId ? <span className="active-sheet-chip">Hoja activa</span> : <span />}
                  <button type="button" title="Opciones de la hoja"><Icon name="dots" size={17} /></button>
                </div>
              </article>
            ))}
            <button className="project-new-diagram-card" type="button" disabled={!activeProject.canEdit} onClick={() => actions.createDiagram().catch((error) => window.alert(error.message))}>
              <span><Icon name="plus" size={22} /></span>
              <strong>Nuevo diagrama</strong>
              <small>Agregar una hoja vacía al proyecto</small>
            </button>
          </div>
        </section>
      )}

      {tab === "people" && (
        <section className="project-overview-section">
          <div className="project-section-heading">
            <div><h2>Participantes</h2><p>Visualiza quién tiene acceso y administra invitaciones con permisos de lectura o edición.</p></div>
            <button className="button button--primary" type="button" disabled={!activeProject.canManage} onClick={actions.openInviteMembers}><Icon name="plus" size={15} /> Invitar persona</button>
          </div>
          <div className="project-people-card">
            <div className="project-people-table-header"><span>Persona</span><span>Rol</span><span>Estado</span><span /></div>
            {activeProject.members.map((member) => (
              <div className="project-people-row" key={member.id}>
                <span className="project-person-identity"><i>{getInitials(member.displayName)}</i><span><strong>{member.displayName}</strong><small>{member.id === activeProject.owner.id ? "Creador del proyecto" : member.email || "Colaborador"}</small></span></span>
                <span className="member-role">{ROLE_LABELS[member.role] ?? member.role}</span>
                <span className="project-person-status"><i /> {member.status === "active" ? "Activo" : "Pendiente"}</span>
                <button type="button" disabled={member.role === "owner"} title="Gestionar acceso"><Icon name="dots" size={17} /></button>
              </div>
            ))}
          </div>
          <div className="project-collaboration-placeholder">
            <Icon name="spark" size={20} />
            <div><strong>Colaboración preparada para una siguiente etapa</strong><p>El proyecto ya distingue propietarios, editores y lectores. Las invitaciones se registran en DynamoDB y se aceptan con una cuenta autenticada.</p></div>
          </div>
        </section>
      )}

      {tab === "settings" && (
        <section className="project-overview-section">
          <div className="project-section-heading">
            <div><h2>Configuración del proyecto</h2><p>Revisa la identidad del proyecto y sus datos principales antes de entrar al editor.</p></div>
            <button className="button button--primary" type="button" disabled={!activeProject.canManage} onClick={actions.openProjectSettings}><Icon name="settings" size={15} /> Editar configuración</button>
          </div>
          <div className="project-settings-summary-grid">
            <article><span>Nombre del proyecto</span><strong>{activeProject.name}</strong></article>
            <article><span>Propietario</span><strong>{activeProject.owner.displayName}</strong></article>
            <article><span>Topología</span><strong>{activeProject.multiDiagram ? "Proyecto multidiagrama" : "Diagramas independientes"}</strong></article>
            <article className="project-settings-summary-grid--wide"><span>Descripción</span><p>{activeProject.description || "Sin descripción"}</p></article>
            <article><span>Creado</span><strong>{formatDate(activeProject.createdAt)}</strong></article>
            <article><span>Identificador cloud</span><code>{activeProject.id}</code></article>
          </div>
          {session?.isGlobalAdmin && activeProject.canManage && (
            <div className="project-template-admin-zone">
              <span><Icon name="spark" size={20} /></span>
              <div>
                <strong>{activeProject.publishedTemplateId ? "Ejemplo publicado" : "Publicar en el catálogo general"}</strong>
                <p>{activeProject.publishedTemplateId
                  ? "Puedes reemplazar el ejemplo vigente con el estado actual guardado del proyecto. Las copias existentes permanecerán intactas."
                  : "Como Global Admin puedes crear un ejemplo oficial a partir de este proyecto sin convertir ni bloquear el proyecto original."}</p>
                {activeProject.publishedTemplateId && <code>{activeProject.publishedTemplateId}</code>}
              </div>
              <button className="button button--primary" type="button" onClick={actions.openPublishTemplate}>
                {activeProject.publishedTemplateId ? "Actualizar ejemplo" : "Publicar como ejemplo"}
              </button>
            </div>
          )}
          <div className="project-danger-zone">
            <div><strong>Zona de administración</strong><p>Las operaciones sensibles permanecen agrupadas para evitar acciones accidentales.</p></div>
            <button className="button danger-outline" type="button" disabled={!activeProject.canManage} onClick={actions.openProjectSettings}>Administrar proyecto</button>
          </div>
        </section>
      )}
    </div>
  );
}
