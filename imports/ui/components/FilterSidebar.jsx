export function FilterSidebar({
  filters,
  onFiltersChange,
  matchingCount,
  favoriteCount,
  selectedSatellite,
  displayedCount,
  onSelectSatellite,
  satellites,
  favoriteIds,
  onToggleFavorite,
}) {
  return (
    <aside className="panel">
      <section className="sidebar-section">
        <h2>Filters</h2>

        <label className="field-label">
          Search by name or NORAD ID
          <input
            type="search"
            placeholder="STARLINK-1008 or 44714"
            value={filters.searchText}
            onChange={(event) => onFiltersChange({ searchText: event.target.value })}
          />
        </label>

        <div className="field-grid field-grid--two">
          <label className="field-label">
            Min altitude (km)
            <input
              type="number"
              min="0"
              max="3000"
              step="10"
              value={filters.altitudeMinKm}
              onChange={(event) =>
                onFiltersChange({ altitudeMinKm: Number(event.target.value || 0) })
              }
            />
          </label>

          <label className="field-label">
            Max altitude (km)
            <input
              type="number"
              min="0"
              max="3000"
              step="10"
              value={filters.altitudeMaxKm}
              onChange={(event) =>
                onFiltersChange({ altitudeMaxKm: Number(event.target.value || 0) })
              }
            />
          </label>
        </div>

        <div className="field-grid field-grid--two">
          <label className="field-label">
            Max visible
            <select
              value={filters.maxVisible === null ? "all" : String(filters.maxVisible)}
              onChange={(event) =>
                onFiltersChange({
                  maxVisible: event.target.value === "all" ? null : Number(event.target.value),
                })
              }
            >
              {[
                { value: "all", label: "All Starlink satellites" },
                { value: 250, label: "250 satellites" },
                { value: 1000, label: "1,000 satellites" },
                { value: 2500, label: "2,500 satellites" },
                { value: 5000, label: "5,000 satellites" },
              ].map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field-label">
            Favorites mode
            <span className="checkbox-row">
              <input
                type="checkbox"
                checked={filters.favoritesOnly}
                onChange={(event) => onFiltersChange({ favoritesOnly: event.target.checked })}
              />
              Show favorites only
            </span>
          </label>
        </div>
      </section>

      <section className="sidebar-section">
        <h3>Reactive Query</h3>

        <div className="summary-grid">
          <div className="metric-card">
            <span className="metric-card__label">Matching</span>
            <span className="metric-card__value">{matchingCount}</span>
          </div>

          <div className="metric-card">
            <span className="metric-card__label">Displayed</span>
            <span className="metric-card__value">{displayedCount}</span>
          </div>

          <div className="metric-card">
            <span className="metric-card__label">Favorites</span>
            <span className="metric-card__value">{favoriteCount}</span>
          </div>

          <div className="metric-card">
            <span className="metric-card__label">Selected</span>
            <span className="metric-card__value">{selectedSatellite ? 1 : 0}</span>
          </div>
        </div>

        <p className="helper-text">
          The server publishes only the current filter subset. Bulk globe points use the latest
          refresh snapshot from the orbital catalog, and only the selected satellite gets extra local
          propagation for the details view and orbit path.
        </p>
      </section>

      <section className="sidebar-section">
        <h3>Visible Satellites</h3>

        <div className="satellite-list">
          {satellites.length === 0 ? (
            <div className="empty-state">No satellites match the active server-side filter set.</div>
          ) : (
            satellites.slice(0, 16).map((satellite) => {
              const isFavorite = favoriteIds.includes(satellite.noradId);

              return (
                <div
                  key={satellite._id}
                  className={[
                    "satellite-list__item",
                    selectedSatellite?.noradId === satellite.noradId &&
                      "satellite-list__item--selected",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => onSelectSatellite(satellite.noradId)}
                >
                  <div>
                    <p className="satellite-list__title">{satellite.name}</p>
                    <p className="satellite-list__meta">
                      NORAD {satellite.noradId} •{" "}
                      {Math.round(
                        satellite.liveSample?.altitudeKm ??
                          satellite.orbit?.currentAltitudeKm ??
                          satellite.orbit?.meanAltitudeKm ??
                          0,
                      )}{" "}
                      km
                    </p>
                  </div>

                  <button
                    className={["favorite-toggle", isFavorite && "favorite-toggle--active"]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleFavorite(satellite.noradId);
                    }}
                    title={isFavorite ? "Remove favorite" : "Add favorite"}
                  >
                    ★
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>
    </aside>
  );
}
