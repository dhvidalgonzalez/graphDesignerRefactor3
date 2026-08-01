import WorkspaceSidebar from "./WorkspaceSidebar.jsx";
import WorkspaceDashboard from "./WorkspaceDashboard.jsx";
import ExamplesGallery from "./ExamplesGallery.jsx";
import ProjectOverview from "./ProjectOverview.jsx";
import BillingPage from "../billing/BillingPage.jsx";
import AccountProfilePage from "../account/AccountProfilePage.jsx";

export default function WorkspacePage({ selectedProjectId = null, billing = false, examples = false, account = false }) {
  return (
    <div className="workspace-shell">
      <WorkspaceSidebar selectedProjectId={selectedProjectId} billing={billing} examples={examples} account={account} />
      <main className="workspace-main">
        {account
          ? <AccountProfilePage />
          : billing
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
