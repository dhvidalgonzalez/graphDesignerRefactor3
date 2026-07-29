import WorkspaceSidebar from "./WorkspaceSidebar.jsx";
import WorkspaceDashboard from "./WorkspaceDashboard.jsx";
import ProjectOverview from "./ProjectOverview.jsx";
import BillingPage from "../billing/BillingPage.jsx";

export default function WorkspacePage({ selectedProjectId = null, billing = false }) {
  return (
    <div className="workspace-shell">
      <WorkspaceSidebar selectedProjectId={selectedProjectId} billing={billing} />
      <main className="workspace-main">
        {billing ? <BillingPage /> : selectedProjectId ? <ProjectOverview /> : <WorkspaceDashboard />}
      </main>
    </div>
  );
}
