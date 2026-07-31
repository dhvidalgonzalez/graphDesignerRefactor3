import { useEffect, useState } from "react";
import Modal from "../common/Modal.jsx";
import { useWorkspace } from "../../workspace/WorkspaceContext.jsx";

const ROLE_LABELS = { owner: "Propietario", editor: "Puede editar", viewer: "Sólo lectura" };

export default function ProjectSettingsModal() {
  const { activeProject, projectSettingsOpen, actions } = useWorkspace();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [multiDiagram, setMultiDiagram] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!activeProject) return;
    setName(activeProject.name);
    setDescription(activeProject.description);
    setMultiDiagram(Boolean(activeProject.multiDiagram));
    setSubmitting(false);
    setError("");
  }, [activeProject, projectSettingsOpen]);

  if (!activeProject) return null;

  const save = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await actions.updateProject({
        name: name.trim() || "Proyecto sin nombre",
        description: description.trim(),
        multiDiagram,
      });
      actions.closeProjectSettings();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "No se pudo actualizar el proyecto.");
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`¿Eliminar “${activeProject.name}” y todos sus diagramas almacenados en S3?`)) return;
    setSubmitting(true);
    setError("");
    try {
      await actions.deleteProject(activeProject.id);
      actions.closeProjectSettings();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "No se pudo eliminar el proyecto.");
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={projectSettingsOpen}
      title="Configuración del proyecto"
      subtitle={`Rol actual: ${ROLE_LABELS[activeProject.role] ?? activeProject.role}`}
      onClose={submitting ? undefined : actions.closeProjectSettings}
      size="large"
    >
      <form className="project-settings-layout" onSubmit={save}>
        <section className="project-settings-general">
          <h3>Información general</h3>
          <label className="property-field">
            <span>Nombre</span>
            <input required maxLength={90} disabled={!activeProject.canManage || submitting} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="property-field">
            <span>Descripción</span>
            <textarea rows={5} maxLength={500} disabled={!activeProject.canManage || submitting} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label className="project-template-option project-template-option--advanced">
            <input
              type="checkbox"
              checked={multiDiagram}
              disabled={!activeProject.canManage || submitting}
              onChange={(event) => setMultiDiagram(event.target.checked)}
            />
            <span>
              <strong>Proyecto multidiagrama</strong>
              <small>Fusiona la topología eléctrica de todas las hojas y habilita referencias lógicas entre terminales.</small>
            </span>
          </label>
          <div className="project-readonly-metadata">
            <span>Identificador</span><code>{activeProject.id}</code>
            <span>Diagramas</span><strong>{activeProject.diagrams.length}</strong>
            <span>Modo de análisis</span><strong>{multiDiagram ? "Red multidiagrama" : "Hoja individual"}</strong>
            <span>Persistencia</span><strong>DynamoDB + S3</strong>
          </div>
        </section>

        <section className="project-access-section">
          <div className="access-heading">
            <div><h3>Personas con acceso</h3><p>Los roles se aplican tanto a los metadatos como a las URLs firmadas de los documentos.</p></div>
            <button className="button" type="button" disabled={!activeProject.canManage || submitting} onClick={() => { actions.closeProjectSettings(); actions.openInviteMembers(); }}>Invitar persona</button>
          </div>
          <div className="member-list">
            {activeProject.members.map((member) => (
              <div className="member-row" key={member.id}>
                <span className="member-avatar">{member.displayName.slice(0, 1).toUpperCase()}</span>
                <span className="member-copy"><strong>{member.displayName}</strong><small>{member.id === activeProject.owner.id ? "Creador del proyecto" : member.status === "pending" ? "Invitación pendiente" : member.email || "Colaborador"}</small></span>
                <span className="member-role">{ROLE_LABELS[member.role] ?? member.role}</span>
              </div>
            ))}
          </div>
          <div className="future-access-note">
            <strong>Control de acceso cloud</strong>
            <span>Propietarios y editores pueden guardar; lectores sólo descargan el JSON mediante una URL temporal validada en el backend.</span>
          </div>
        </section>

        {error && <div className="form-error-message project-settings-error">{error}</div>}
        <div className="modal-actions project-settings-actions">
          <button className="button danger-outline" type="button" disabled={!activeProject.canManage || submitting} onClick={remove}>Eliminar proyecto</button>
          <span />
          <button className="button" type="button" disabled={submitting} onClick={actions.closeProjectSettings}>Cancelar</button>
          <button className="button button--primary" type="submit" disabled={!activeProject.canManage || submitting}>{submitting ? "Guardando…" : "Guardar cambios"}</button>
        </div>
      </form>
    </Modal>
  );
}
