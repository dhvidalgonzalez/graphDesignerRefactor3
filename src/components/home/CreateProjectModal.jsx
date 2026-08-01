import { useEffect, useState } from "react";
import Modal from "../common/Modal.jsx";
import { useWorkspace } from "../../workspace/WorkspaceContext.jsx";

export default function CreateProjectModal() {
  const { createProjectOpen, actions } = useWorkspace();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [multiDiagram, setMultiDiagram] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!createProjectOpen) return;
    setName("");
    setDescription("");
    setMultiDiagram(false);
    setSubmitting(false);
    setError("");
  }, [createProjectOpen]);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await actions.createProject({ name, description, multiDiagram });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "No se pudo crear el proyecto.");
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={createProjectOpen}
      title="Crear proyecto"
      subtitle="Comienza con una estructura clara"
      onClose={submitting ? undefined : actions.closeCreateProject}
      size="medium"
    >
      <form className="project-form" onSubmit={submit}>
        <p className="form-lead">
          Se creará el proyecto junto con su primera hoja, listo para comenzar a dibujar y configurar la red.
        </p>
        <label className="property-field">
          <span>Nombre del proyecto</span>
          <input
            autoFocus
            required
            maxLength={90}
            value={name}
            disabled={submitting}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ej. Subestación Norte"
          />
        </label>
        <label className="property-field">
          <span>Descripción opcional</span>
          <textarea
            rows={4}
            maxLength={500}
            value={description}
            disabled={submitting}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Alcance, instalación o propósito del proyecto"
          />
        </label>
        <label className="project-template-option project-template-option--advanced">
          <input
            type="checkbox"
            checked={multiDiagram}
            disabled={submitting}
            onChange={(event) => setMultiDiagram(event.target.checked)}
          />
          <span>
            <strong>Proyecto multidiagrama</strong>
            <small>Permite conectar terminales entre hojas y analizar todos los diagramas como una sola red eléctrica.</small>
          </span>
        </label>
        {error && <div className="form-error-message">{error}</div>}
        <div className="modal-actions modal-actions--single">
          <button className="button" type="button" disabled={submitting} onClick={actions.closeCreateProject}>Cancelar</button>
          <button className="button button--primary" type="submit" disabled={!name.trim() || submitting}>
            {submitting ? "Creando proyecto…" : "Crear proyecto"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
