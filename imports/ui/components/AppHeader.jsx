import { formatCountdownLabel } from "/imports/ui/lib/formatters";
import { useCurrentTime } from "/imports/ui/hooks/useCurrentTime";

export function AppHeader({ status }) {
  useCurrentTime(1000);

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
