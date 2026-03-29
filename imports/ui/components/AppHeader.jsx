import { formatCountdownLabel, formatDistanceToNowLabel } from "/imports/ui/lib/formatters";
import { useCurrentTime } from "/imports/ui/hooks/useCurrentTime";

export function AppHeader({ status }) {
  useCurrentTime(1000);
  const refreshStateClassName =
    status?.refreshState === "success"
      ? "status-pill status-pill--ok"
      : status?.refreshState === "stale" || status?.refreshState === "blocked"
        ? "status-pill status-pill--warn"
      : status?.refreshState === "failed"
        ? "status-pill status-pill--error"
        : "status-pill";

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
        <span className={refreshStateClassName}>
          {status?.refreshState === "stale"
            ? "cached"
            : status?.refreshState === "blocked"
              ? "provider cooldown"
              : status?.refreshState || "idle"}
          {status?.lastSuccessAt ? ` • ${formatDistanceToNowLabel(status.lastSuccessAt)}` : ""}
        </span>
        <span className="header-pill">
          Next sync {status?.refreshInProgress ? "• running" : `• ${formatCountdownLabel(status?.nextRefreshAt)}`}
        </span>
      </div>
    </header>
  );
}
