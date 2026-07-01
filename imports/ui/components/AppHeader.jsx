import { formatCountdownLabel } from "/imports/ui/lib/formatters";

// Re-renders every second through its parent (DashboardPage ticks on a 1s
// timer), so the "Next sync" countdown stays live without a redundant local
// interval of its own.
export function AppHeader({ status }) {
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand__eyebrow">Meteor 3 • Cesium • satellite.js</span>
        <h1 className="brand__title">Starlink Constellation Visualizer</h1>
        <p className="brand__subtitle">
          Reactive pub/sub filters, orbital catalog ingestion, and high-volume constellation
          rendering from public orbital element sets.
        </p>
      </div>

      <div className="header-actions">
        <span className="header-pill">
          Next sync {status?.refreshInProgress ? "• running" : `• ${formatCountdownLabel(status?.nextRefreshAt)}`}
        </span>
      </div>
    </header>
  );
}
