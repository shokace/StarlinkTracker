import { formatDateTimeLabel } from "/imports/ui/lib/formatters";

function Tile({ label, value }) {
  return (
    <div className="status-tile">
      <span className="status-tile__label">{label}</span>
      <span className="status-tile__value">{value}</span>
    </div>
  );
}

export function StatusBar({ status, matchingCount, displayedCount }) {
  return (
    <section className="status-bar">
      <Tile label="Total in Mongo" value={status?.totalSatellites ?? 0} />
      <Tile label="Matching filter" value={matchingCount} />
      <Tile label="Displayed on globe" value={displayedCount} />
      <Tile label="Last refresh" value={formatDateTimeLabel(status?.lastRefreshAt)} />
      <Tile
        label="Refresh health"
        value={
          status?.refreshState === "failed"
            ? `Failed${status?.lastError ? `: ${status.lastError}` : ""}`
            : status?.refreshState === "stale" || status?.refreshState === "blocked"
              ? status?.lastWarning || "Using cached orbital data"
              : status?.refreshState || "idle"
        }
      />
    </section>
  );
}
