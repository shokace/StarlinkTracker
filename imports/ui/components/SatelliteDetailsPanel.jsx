import { formatDateTimeLabel, formatNumberLabel } from "/imports/ui/lib/formatters";

function DetailItem({ label, value }) {
  return (
    <div className="details-item">
      <span className="details-item__label">{label}</span>
      <span className="details-item__value">{value ?? "—"}</span>
    </div>
  );
}

export function SatelliteDetailsPanel({
  satellite,
  liveState,
  isFavorite,
  onToggleFavorite,
  lastRefreshAt,
}) {
  if (!satellite) {
    return (
      <aside className="panel details-panel">
        <h2>Satellite Details</h2>
        <div className="empty-state">
          Select a Starlink satellite from the globe or sidebar to inspect live propagated
          coordinates and the normalized orbital record.
        </div>
      </aside>
    );
  }

  return (
    <aside className="panel details-panel">
      <h2>Satellite Details</h2>

      <section className="details-hero">
        <div>
          <h3>{satellite.name}</h3>
          <div className="details-hero__meta">
            NORAD {satellite.noradId} • {satellite.orbit?.orbitalCategory || "Unknown category"}
          </div>
        </div>

        <button
          className={[
            "favorite-button",
            isFavorite && "favorite-button--active",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => onToggleFavorite(satellite.noradId)}
        >
          {isFavorite ? "Favorited" : "Add favorite"}
        </button>
      </section>

      <div className="details-grid">
        <DetailItem label="Epoch" value={formatDateTimeLabel(satellite.epoch)} />
        <DetailItem label="Data refresh" value={formatDateTimeLabel(lastRefreshAt)} />
        <DetailItem label="Inclination" value={formatNumberLabel(satellite.orbit?.inclinationDeg, "°")} />
        <DetailItem label="Eccentricity" value={formatNumberLabel(satellite.orbit?.eccentricity, "", 6)} />
        <DetailItem
          label="Mean motion"
          value={formatNumberLabel(satellite.orbit?.meanMotionRevsPerDay, " rev/day", 4)}
        />
        <DetailItem
          label="Current altitude"
          value={formatNumberLabel(liveState?.altitudeKm, " km")}
        />
        <DetailItem
          label="Current latitude"
          value={formatNumberLabel(liveState?.latitudeDeg, "°")}
        />
        <DetailItem
          label="Current longitude"
          value={formatNumberLabel(liveState?.longitudeDeg, "°")}
        />
        <DetailItem
          label="Velocity"
          value={formatNumberLabel(liveState?.velocityKms, " km/s", 3)}
        />
        <DetailItem
          label="Mean altitude"
          value={formatNumberLabel(satellite.orbit?.meanAltitudeKm, " km")}
        />
        <DetailItem label="Intl Designator" value={satellite.intlDes || "—"} />
        <DetailItem label="Source" value={satellite.source?.provider || "Unknown"} />
      </div>

      <p className="helper-text">
        Positions shown here are estimated from public orbital element sets and propagated with
        <span className="mono"> satellite.js</span>. They are not direct SpaceX telemetry.
      </p>
    </aside>
  );
}
