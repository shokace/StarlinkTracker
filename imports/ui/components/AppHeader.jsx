import { formatDistanceToNowLabel } from "/imports/ui/lib/formatters";

export function AppHeader({ status, isRefreshing, onRefresh }) {
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
          Reactive pub/sub filters, Mongo-backed orbital catalog ingestion, and high-volume
          constellation rendering from public orbital element sets.
        </p>
      </div>

      <div className="header-actions">
        <span className={refreshStateClassName}>
          {status?.refreshState === "stale"
            ? "cached"
            : status?.refreshState === "blocked"
              ? "source blocked"
              : status?.refreshState || "idle"}
          {status?.lastSuccessAt ? ` • ${formatDistanceToNowLabel(status.lastSuccessAt)}` : ""}
        </span>

        <button className="refresh-button" disabled={isRefreshing} onClick={onRefresh}>
          {isRefreshing ? "Refreshing..." : "Refresh orbital data"}
        </button>
      </div>
    </header>
  );
}
