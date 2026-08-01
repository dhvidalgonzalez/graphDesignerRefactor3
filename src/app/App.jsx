import { useEffect, useMemo, useState } from "react";
import EditorShell from "../components/layout/EditorShell.jsx";
import LandingPage from "../components/home/LandingPage.jsx";
import CreateProjectModal from "../components/home/CreateProjectModal.jsx";
import WorkspacePage from "../components/workspace/WorkspacePage.jsx";
import ProjectSettingsModal from "../components/project/ProjectSettingsModal.jsx";
import InviteMembersModal from "../components/project/InviteMembersModal.jsx";
import ShareProjectModal from "../components/project/ShareProjectModal.jsx";
import PublishTemplateModal from "../components/project/PublishTemplateModal.jsx";
import InvitationAcceptPage from "../components/invitations/InvitationAcceptPage.jsx";
import BillingPage from "../components/billing/BillingPage.jsx";
import AuthGate from "../components/auth/AuthGate/index.jsx";
import LoadingIndicator from "../components/common/LoadingIndicator.jsx";
import { EditorProvider } from "../editor/EditorContext.jsx";
import { EditorStore } from "../editor/EditorStore.js";
import { WorkspaceProvider, useWorkspace } from "../workspace/WorkspaceContext.jsx";
import { hasAmplifyOutputs } from "../config/amplify.js";

function parseRoute() {
  const hash = window.location.hash || "#/";
  if (hash === "#/" || hash === "#") return { name: "landing", projectId: null };
  if (hash === "#/workspace") return { name: "workspace", projectId: null };
  if (hash === "#/workspace/examples") return { name: "examples", projectId: null };
  if (hash.startsWith("#/workspace/billing")) return { name: "billing", projectId: null };
  if (hash === "#/workspace/profile") return { name: "profile", projectId: null };

  const invitationMatch = hash.match(/^#\/invitations\/([^/?#]+)$/);
  if (invitationMatch) {
    return {
      name: "invitation",
      projectId: null,
      invitationId: decodeURIComponent(invitationMatch[1]),
    };
  }

  const editorMatch = hash.match(/^#\/workspace\/projects\/([^/?#]+)\/editor$/);
  if (editorMatch) return { name: "editor", projectId: decodeURIComponent(editorMatch[1]) };

  const projectMatch = hash.match(/^#\/workspace\/projects\/([^/?#]+)$/);
  if (projectMatch) return { name: "project", projectId: decodeURIComponent(projectMatch[1]) };

  const legacyMatch = hash.match(/^#\/projects\/([^/?#]+)/);
  if (legacyMatch) return { name: "project", projectId: decodeURIComponent(legacyMatch[1]), legacy: true };

  return { name: "landing", projectId: null };
}

function DiagramEditorInstance({
  initialDocument,
  readOnly = false,
  recoveredDraft = false,
  staleDraft = false,
}) {
  const [store] = useState(() => {
    const nextStore = new EditorStore(initialDocument, { readOnly });
    if (recoveredDraft && !readOnly) {
      nextStore.actions.setPersistence(
        "dirty",
        "Borrador local recuperado · pendiente de sincronizar",
      );
    } else if (staleDraft) {
      nextStore.actions.setNotice(
        "Se cargó la versión guardada más reciente porque el proyecto cambió desde otro dispositivo o usuario.",
        "warning",
      );
    }
    return nextStore;
  });
  return (
    <EditorProvider store={store}>
      <EditorShell />
    </EditorProvider>
  );
}

function ProjectEditorHost() {
  const { activeProject, activeDiagram } = useWorkspace();
  if (!activeProject || !activeDiagram?.document) return null;
  return (
    <DiagramEditorInstance
      key={`${activeProject.id}:${activeDiagram.id}:${activeProject.editorRevision ?? 0}`}
      initialDocument={activeDiagram.document}
      readOnly={!activeProject.canEdit}
      recoveredDraft={activeProject.recoveredDraft}
      staleDraft={activeProject.staleDraft}
    />
  );
}

function ProtectedRouter({ route, setRoute }) {
  const { activeProject, status, error, actions } = useWorkspace();

  useEffect(() => {
    if (!route.projectId || activeProject?.id === route.projectId) return;
    let cancelled = false;
    actions.loadProject(route.projectId, { loadDiagram: route.name === "editor" })
      .then((project) => {
        if (!cancelled && !project) window.location.hash = "#/workspace";
      })
      .catch(() => {
        if (!cancelled) window.location.hash = "#/workspace";
      });
    return () => { cancelled = true; };
  }, [actions, activeProject?.id, route.name, route.projectId]);

  useEffect(() => {
    if (route.legacy && route.projectId) {
      window.history.replaceState(null, "", `#/workspace/projects/${encodeURIComponent(route.projectId)}`);
      setRoute({ name: "project", projectId: route.projectId });
    }
  }, [route.legacy, route.projectId, setRoute]);

  const content = useMemo(() => {
    if (status === "error") {
      return (
        <div className="workspace-route-loading workspace-route-loading--error">
          <strong>No fue posible cargar tus proyectos</strong>
          <span>{error?.message || "Inténtalo nuevamente."}</span>
          <button className="button button--primary" type="button" onClick={actions.refreshSummaries}>Reintentar</button>
        </div>
      );
    }
    if (status === "loading" || status === "loading-project" || status === "saving") {
      const label = status === "saving"
        ? "Guardando cambios del proyecto…"
        : route.name === "editor"
          ? "Preparando el editor y cargando la hoja…"
          : route.name === "project"
            ? "Cargando proyecto…"
            : "Cargando tus espacios de trabajo…";
      return (
        <div className="workspace-route-loading">
          <LoadingIndicator label={label} />
        </div>
      );
    }
    if (route.name === "workspace") return <WorkspacePage />;
    if (route.name === "examples") return <WorkspacePage examples />;
    if (route.name === "billing") return <WorkspacePage billing />;
    if (route.name === "profile") return <WorkspacePage account />;
    if (route.name === "invitation") {
      return <InvitationAcceptPage invitationId={route.invitationId} />;
    }
    if (route.name === "project") {
      return activeProject?.id === route.projectId
        ? <WorkspacePage selectedProjectId={route.projectId} />
        : <div className="workspace-route-loading"><LoadingIndicator label="Cargando proyecto…" /></div>;
    }
    if (route.name === "editor") {
      return activeProject?.id === route.projectId && activeProject.diagrams.some((item) => item.document)
        ? <ProjectEditorHost />
        : <div className="workspace-route-loading"><LoadingIndicator label="Preparando el editor y cargando la hoja…" /></div>;
    }
    return <WorkspacePage />;
  }, [
    actions,
    activeProject,
    error?.message,
    route.invitationId,
    route.name,
    route.projectId,
    status,
  ]);

  return (
    <>
      {content}
      <CreateProjectModal />
      <ProjectSettingsModal />
      <InviteMembersModal />
      <ShareProjectModal />
      <PublishTemplateModal />
    </>
  );
}

function ConfigurationNotice() {
  return (
    <div className="session-state-page session-state-page--error">
      <strong>La aplicación todavía no está configurada</strong>
      <p>Completa la configuración del entorno antes de ingresar al espacio de trabajo.</p>
      <a className="button button--soft" href="#/">Volver al inicio</a>
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState(parseRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (route.name === "landing") return <LandingPage />;
  if (!hasAmplifyOutputs()) return <ConfigurationNotice />;

  return (
    <AuthGate>
      <WorkspaceProvider>
        <ProtectedRouter route={route} setRoute={setRoute} />
      </WorkspaceProvider>
    </AuthGate>
  );
}
