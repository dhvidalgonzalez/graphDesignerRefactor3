import { useEffect, useState } from "react";
import Modal from "../common/Modal.jsx";
import { useWorkspace } from "../../workspace/WorkspaceContext.jsx";

export default function CreateProjectModal() {
  const { createProjectOpen, actions } = useWorkspace();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sample, setSample] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!createProjectOpen) return;
    setName("");
    setDescription("");
    setSample(false);
    setSubmitting(false);
    setError("");
  }, [createProjectOpen]);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await actions.createProject({ name, description, sample });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "No se pudo crear el proyecto.");
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={createProjectOpen}
      title="Crear proyecto"
      subtitle="Tu espacio de trabajo cloud"
      onClose={submitting ? undefined : actions.closeCreateProject}
      size="medium"
    >
      <form className="project-form" onSubmit={submit}>
        <p className="form-lead">
          Se creará el proyecto en DynamoDB y su primera hoja se almacenará como un documento JSON en S3.
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
        <label className="project-template-option">
          <input type="checkbox" checked={sample} disabled={submitting} onChange={(event) => setSample(event.target.checked)} />
          <span>
            <strong>Incluir diagrama de demostración</strong>
            <small>Agrega el circuito de prueba de 220/66 kV. Si no, se crea una hoja vacía.</small>
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
