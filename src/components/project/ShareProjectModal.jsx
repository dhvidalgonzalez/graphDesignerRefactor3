import { useState } from "react";
import Modal from "../common/Modal.jsx";
import Icon from "../common/Icon.jsx";
import { useWorkspace } from "../../workspace/WorkspaceContext.jsx";

export default function ShareProjectModal() {
  const { activeProject, shareProjectOpen, actions } = useWorkspace();
  const [copied, setCopied] = useState(false);
  if (!activeProject) return null;

  const projectUrl = `${window.location.origin}${window.location.pathname}#/workspace/projects/${encodeURIComponent(activeProject.id)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(projectUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copia el enlace del proyecto:", projectUrl);
    }
  };

  return (
    <Modal open={shareProjectOpen} title="Compartir proyecto" subtitle={activeProject.name} onClose={actions.closeShareProject} size="medium">
      <div className="share-project-modal">
        <div className="share-project-illustration"><Icon name="share" size={28} /></div>
        <h3>Enlace del proyecto</h3>
        <p>El enlace abre el proyecto después del inicio de sesión. La persona sólo podrá acceder cuando exista una invitación aceptada para su cuenta.</p>
        <label className="property-field"><span>Enlace protegido</span><div className="share-link-preview"><input readOnly value={projectUrl} /><button type="button" onClick={copy}>{copied ? "Copiado" : "Copiar"}</button></div></label>
        <label className="property-field"><span>Acceso del enlace</span><select disabled defaultValue="restricted"><option value="restricted">Sólo personas invitadas</option></select></label>
        <div className="share-project-actions">
          <button className="button button--soft" type="button" onClick={() => { actions.closeShareProject(); actions.openInviteMembers(); }}><Icon name="users" size={15} /> Gestionar personas</button>
          <button className="button button--primary" type="button" onClick={copy}>Copiar enlace</button>
        </div>
      </div>
    </Modal>
  );
}
