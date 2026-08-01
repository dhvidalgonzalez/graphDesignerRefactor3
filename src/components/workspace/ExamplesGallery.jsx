import { useEffect, useMemo, useState } from "react";
import Icon from "../common/Icon.jsx";
import { useWorkspace } from "../../workspace/WorkspaceContext.jsx";

function ExamplePreview({ template }) {
  return (
    <div className="example-card-preview" aria-hidden="true">
      <svg viewBox="0 0 220 120">
        <path d="M18 31h52v26h48v31h83" />
        <path d="M118 57V28h62" />
        <circle cx="70" cy="57" r="9" />
        <circle cx="88" cy="57" r="9" />
        <path className="example-card-bus" d="M139 88h62" />
      </svg>
      {template.featured && <span>Destacado</span>}
    </div>
  );
}

export default function ExamplesGallery() {
  const {
    projectTemplates,
    templateStatus,
    templateError,
    actions,
  } = useWorkspace();
  const [query, setQuery] = useState("");
  const [copyingId, setCopyingId] = useState(null);

  useEffect(() => {
    if (templateStatus === "idle") actions.refreshTemplates().catch(() => {});
  }, [actions, templateStatus]);

  const visibleTemplates = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return projectTemplates;
    return projectTemplates.filter((template) => (
      `${template.name} ${template.description || ""} ${template.category || ""}`
        .toLowerCase()
        .includes(normalized)
    ));
  }, [projectTemplates, query]);

  const createCopy = async (template) => {
    setCopyingId(template.id);
    try {
      await actions.instantiateTemplate(template);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "No se pudo crear la copia del ejemplo.");
      setCopyingId(null);
    }
  };

  return (
    <div className="workspace-content-scroll examples-page">
      <header className="workspace-content-header">
        <div>
          <span className="workspace-kicker">Catálogo de la aplicación</span>
          <h1>Ejemplos</h1>
          <p>Parte desde una red preparada. Al usar un ejemplo se crea un proyecto completamente independiente dentro de tu cuenta.</p>
        </div>
        <button className="button button--soft" type="button" onClick={() => actions.refreshTemplates().catch(() => {})}>
          <Icon name="refresh" size={15} /> Actualizar catálogo
        </button>
      </header>

      <section className="examples-information-card">
        <span><Icon name="spark" size={20} /></span>
        <div>
          <strong>Los ejemplos originales nunca se modifican</strong>
          <p>La copia recibe nuevos identificadores, nuevos documentos en S3 y tu usuario queda como propietario. Puedes editarla, compartirla o eliminarla sin afectar el catálogo.</p>
        </div>
      </section>

      <section className="workspace-projects-panel examples-panel">
        <div className="workspace-list-toolbar">
          <div>
            <h2>Ejemplos disponibles</h2>
            <span>{visibleTemplates.length} resultados</span>
          </div>
          <label className="workspace-search">
            <Icon name="search" size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar ejemplo" />
          </label>
        </div>

        {templateStatus === "loading" ? (
          <div className="workspace-empty-state"><span className="session-loader" /><h3>Cargando ejemplos</h3><p>Consultando el catálogo publicado por los administradores.</p></div>
        ) : templateStatus === "error" ? (
          <div className="workspace-empty-state">
            <span><Icon name="refresh" size={26} /></span>
            <h3>No fue posible cargar los ejemplos</h3>
            <p>{templateError?.message || "Inténtalo nuevamente."}</p>
            <button className="button button--primary" type="button" onClick={() => actions.refreshTemplates().catch(() => {})}>Reintentar</button>
          </div>
        ) : visibleTemplates.length ? (
          <div className="examples-grid">
            {visibleTemplates.map((template) => (
              <article className="example-card" key={template.id}>
                <ExamplePreview template={template} />
                <div className="example-card-copy">
                  <div className="example-card-heading">
                    <span>{template.category || "Ejemplo eléctrico"}</span>
                    {template.multiDiagram && <small>Multidiagrama</small>}
                  </div>
                  <h3>{template.name}</h3>
                  <p>{template.description || "Proyecto de ejemplo preparado para explorar el editor y modificar sus parámetros."}</p>
                  <div className="example-card-metrics">
                    <span><Icon name="file" size={13} /> {template.diagramCount} {template.diagramCount === 1 ? "diagrama" : "diagramas"}</span>
                    <span><Icon name="grid" size={13} /> {template.componentCount} componentes</span>
                  </div>
                </div>
                <div className="example-card-footer">
                  <small>Se creará una copia en Mis proyectos</small>
                  <button
                    className="button button--primary"
                    type="button"
                    disabled={Boolean(copyingId)}
                    onClick={() => createCopy(template)}
                  >
                    {copyingId === template.id ? "Creando copia…" : "Usar ejemplo"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="workspace-empty-state">
            <span><Icon name={projectTemplates.length ? "search" : "spark"} size={26} /></span>
            <h3>{projectTemplates.length ? "No encontramos ejemplos" : "Todavía no hay ejemplos publicados"}</h3>
            <p>{projectTemplates.length ? "Prueba con otra búsqueda." : "Un Global Admin puede publicar un proyecto desde la sección de configuración del proyecto."}</p>
          </div>
        )}
      </section>
    </div>
  );
}
