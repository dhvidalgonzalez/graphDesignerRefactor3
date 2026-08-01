import WorkspaceSidebar from "./WorkspaceSidebar.jsx";
import WorkspaceDashboard from "./WorkspaceDashboard.jsx";
import ExamplesGallery from "./ExamplesGallery.jsx";
import ProjectOverview from "./ProjectOverview.jsx";
import BillingPage from "../billing/BillingPage.jsx";

export default function WorkspacePage({ selectedProjectId = null, billing = false, examples = false }) {
  return (
    <div className="workspace-shell">
      <WorkspaceSidebar selectedProjectId={selectedProjectId} billing={billing} examples={examples} />
      <main className="workspace-main">
        {billing
          ? <BillingPage />
          : examples
            ? <ExamplesGallery />
            : selectedProjectId
              ? <ProjectOverview />
              : <WorkspaceDashboard />}
      </main>
    </div>
  );
}
