import { useEffect, useState } from "react";
import Modal from "../common/Modal.jsx";
import { useWorkspace } from "../../workspace/WorkspaceContext.jsx";

export default function PublishTemplateModal() {
  const {
    activeProject,
    publishTemplateOpen,
    actions,
  } = useWorkspace();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [featured, setFeatured] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!publishTemplateOpen || !activeProject) return undefined;
    let cancelled = false;

    const prepare = async () => {
      let currentTemplate = null;
      if (activeProject.publishedTemplateId) {
        try {
          const templates = await actions.refreshTemplates();
          currentTemplate = templates.find((item) => item.id === activeProject.publishedTemplateId) ?? null;
        } catch {
          currentTemplate = null;
        }
      }
      if (cancelled) return;
      setName(currentTemplate?.name || activeProject.name || "");
      setDescription(currentTemplate?.description || activeProject.description || "");
      setCategory(currentTemplate?.category || "");
      setFeatured(Boolean(currentTemplate?.featured));
      setSubmitting(false);
      setError("");
    };

    prepare();
    return () => { cancelled = true; };
  }, [actions, activeProject, publishTemplateOpen]);

  if (!activeProject) return null;

  const updating = Boolean(activeProject.publishedTemplateId);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await actions.publishTemplate({
        name: name.trim(),
        description: description.trim(),
        category: category.trim(),
        featured,
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "No se pudo publicar el ejemplo.");
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={publishTemplateOpen}
      title={updating ? "Actualizar ejemplo" : "Publicar como ejemplo"}
      subtitle="Catálogo general de la aplicación"
      onClose={submitting ? undefined : actions.closePublishTemplate}
      size="medium"
    >
      <form className="project-form" onSubmit={submit}>
        <p className="form-lead">
          {updating
            ? "Se reemplazará el contenido vigente del ejemplo. Las copias que otros usuarios ya crearon no serán modificadas."
            : "Se generará una copia independiente del proyecto para el catálogo. El proyecto original seguirá siendo editable en tu cuenta."}
        </p>
        <label className="property-field">
          <span>Nombre público</span>
          <input required maxLength={90} value={name} disabled={submitting} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="property-field">
          <span>Descripción</span>
          <textarea rows={4} maxLength={500} value={description} disabled={submitting} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label className="property-field">
          <span>Categoría opcional</span>
          <input maxLength={60} value={category} disabled={submitting} onChange={(event) => setCategory(event.target.value)} placeholder="Ej. Distribución, generación o subestaciones" />
        </label>
        <label className="project-template-option">
          <input type="checkbox" checked={featured} disabled={submitting} onChange={(event) => setFeatured(event.target.checked)} />
          <span>
            <strong>Destacar en el catálogo</strong>
            <small>Los ejemplos destacados se muestran antes que el resto.</small>
          </span>
        </label>
        <div className="template-publication-note">
          <strong>Contenido que se publicará</strong>
          <span>{activeProject.diagrams.length} {activeProject.diagrams.length === 1 ? "diagrama" : "diagramas"} · contenido actual guardado</span>
        </div>
        {error && <div className="form-error-message">{error}</div>}
        <div className="modal-actions modal-actions--single">
          <button className="button" type="button" disabled={submitting} onClick={actions.closePublishTemplate}>Cancelar</button>
          <button className="button button--primary" type="submit" disabled={!name.trim() || submitting}>
            {submitting ? "Publicando…" : updating ? "Actualizar ejemplo" : "Publicar ejemplo"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
