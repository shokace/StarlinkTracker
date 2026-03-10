import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { startTransition, useDeferredValue, useEffect, useState } from "react";
import {
  CLIENT_PROPAGATION_INTERVAL_MS,
  DEFAULT_ALTITUDE_MAX_KM,
  DEFAULT_ALTITUDE_MIN_KM,
  DEFAULT_MAX_VISIBLE,
  SELECTED_ORBIT_PATH_SAMPLE_COUNT,
  SELECTED_ORBIT_PATH_STEP_SECONDS,
} from "/imports/api/satellites/constants";
import { SatelliteCountsCollection } from "/imports/api/satellites/satelliteCounts";
import { SatellitesCollection } from "/imports/api/satellites/satellites";
import { StatusCollection } from "/imports/api/status/status";
import { computeSatelliteState, sampleOrbitPath } from "/imports/lib/orbit/propagation";
import { AppHeader } from "/imports/ui/components/AppHeader";
import { FilterSidebar } from "/imports/ui/components/FilterSidebar";
import { GlobeViewer } from "/imports/ui/components/GlobeViewer";
import { SatelliteDetailsPanel } from "/imports/ui/components/SatelliteDetailsPanel";
import { StatusBar } from "/imports/ui/components/StatusBar";
import { useCurrentTime } from "/imports/ui/hooks/useCurrentTime";
import {
  getFavoriteNoradIds,
  isFavoriteNoradId,
  toggleFavoriteNoradId,
} from "/imports/ui/state/favorites";

const initialFilters = {
  searchText: "",
  altitudeMinKm: DEFAULT_ALTITUDE_MIN_KM,
  altitudeMaxKm: DEFAULT_ALTITUDE_MAX_KM,
  favoritesOnly: false,
  maxVisible: DEFAULT_MAX_VISIBLE,
};

function matchesLocalFilter(satellite, filters, favoriteNoradIds) {
  const altitudeKm =
    satellite.liveSample?.altitudeKm ??
    satellite.orbit?.currentAltitudeKm ??
    satellite.orbit?.meanAltitudeKm;

  if (Number.isFinite(altitudeKm)) {
    if (altitudeKm < filters.altitudeMinKm || altitudeKm > filters.altitudeMaxKm) {
      return false;
    }
  }

  if (filters.searchText) {
    const searchText = filters.searchText.toLowerCase();
    const matchesSearch =
      satellite.name?.toLowerCase().includes(searchText) ||
      String(satellite.noradId).includes(searchText);

    if (!matchesSearch) {
      return false;
    }
  }

  if (filters.favoritesOnly && !favoriteNoradIds.includes(satellite.noradId)) {
    return false;
  }

  return true;
}

function useDashboardData(filters, selectedNoradId) {
  return useTracker(() => {
    const favoriteNoradIds = getFavoriteNoradIds();
    const subscriptionFilters = {
      ...filters,
      favoriteNoradIds,
    };
    const filteredHandle = Meteor.subscribe("satellites.filtered", subscriptionFilters);
    const countHandle = Meteor.subscribe("satellites.filteredCount", subscriptionFilters);
    const statusHandle = Meteor.subscribe("app.status");
    const singleHandle = selectedNoradId
      ? Meteor.subscribe("satellites.single", selectedNoradId)
      : null;

    const satellites = SatellitesCollection.find(
      {},
      {
        sort: {
          "orbit.currentAltitudeKm": 1,
          noradId: 1,
        },
      },
    )
      .fetch()
      .filter((satellite) => matchesLocalFilter(satellite, filters, favoriteNoradIds))
      .slice(0, filters.maxVisible);
    const selectedSatellite = selectedNoradId
      ? SatellitesCollection.findOne({ noradId: selectedNoradId })
      : null;
    const satelliteCounts = SatelliteCountsCollection.findOne("current");
    const status = StatusCollection.findOne();

    return {
      favoriteNoradIds,
      satellites,
      selectedSatellite,
      matchingCount: satelliteCounts?.matchingCount ?? satellites.length,
      status,
      loading:
        !filteredHandle.ready() ||
        !countHandle.ready() ||
        !statusHandle.ready() ||
        (singleHandle ? !singleHandle.ready() : false),
    };
  }, [
    filters.searchText,
    filters.altitudeMinKm,
    filters.altitudeMaxKm,
    filters.favoritesOnly,
    filters.maxVisible,
    selectedNoradId,
  ]);
}

export function DashboardPage() {
  const [filters, setFilters] = useState(initialFilters);
  const [selectedNoradId, setSelectedNoradId] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const deferredSearchText = useDeferredValue(filters.searchText);
  const currentTime = useCurrentTime(CLIENT_PROPAGATION_INTERVAL_MS);
  const reactiveFilters = {
    ...filters,
    searchText: deferredSearchText,
  };
  const { favoriteNoradIds, satellites, selectedSatellite, matchingCount, status, loading } =
    useDashboardData(reactiveFilters, selectedNoradId);
  const positionsByNoradId = new Map(
    satellites
      .filter((satellite) => satellite.liveSample)
      .map((satellite) => [satellite.noradId, satellite.liveSample]),
  );

  const selectedLiveState = selectedSatellite
    ? computeSatelliteState(selectedSatellite, currentTime) ||
      positionsByNoradId.get(selectedSatellite.noradId)
    : null;
  const selectedDisplayState = selectedNoradId ? positionsByNoradId.get(selectedNoradId) : null;
  const selectedOrbitPath = selectedSatellite
    ? sampleOrbitPath(selectedSatellite, {
        startDate: currentTime,
        sampleCount: SELECTED_ORBIT_PATH_SAMPLE_COUNT,
        stepSeconds: SELECTED_ORBIT_PATH_STEP_SECONDS,
      })
    : [];

  useEffect(() => {
    if (selectedNoradId && !selectedSatellite && !loading) {
      setSelectedNoradId(null);
    }
  }, [loading, selectedNoradId, selectedSatellite]);

  async function handleRefresh() {
    setIsRefreshing(true);
    setRefreshError("");

    try {
      await Meteor.callAsync("satellites.refreshNow");
    } catch (error) {
      setRefreshError(error.reason || error.message);
    } finally {
      setIsRefreshing(false);
    }
  }

  function handleFiltersChange(partialFilters) {
    startTransition(() => {
      setFilters((currentFilters) => ({
        ...currentFilters,
        ...partialFilters,
      }));
    });
  }

  function handleToggleFavorite(noradId) {
    const nextFavoriteIds = toggleFavoriteNoradId(noradId);
    const isFavorite = nextFavoriteIds.includes(noradId);

    Meteor.callAsync("satellites.toggleFavorite", {
      noradId,
      isFavorite,
    }).catch((error) => {
      console.warn("[favorites] Server acknowledgement failed", error);
    });
  }

  function handleSelectSatellite(noradId) {
    startTransition(() => {
      setSelectedNoradId(noradId);
    });
  }

  return (
    <div className="app-shell">
      <AppHeader status={status} isRefreshing={isRefreshing} onRefresh={handleRefresh} />

      <main className="dashboard-grid">
        <FilterSidebar
          filters={filters}
          onFiltersChange={handleFiltersChange}
          matchingCount={matchingCount}
          displayedCount={satellites.length}
          favoriteCount={favoriteNoradIds.length}
          selectedSatellite={selectedSatellite}
          satellites={satellites}
          favoriteIds={favoriteNoradIds}
          onToggleFavorite={handleToggleFavorite}
          onSelectSatellite={handleSelectSatellite}
        />

        <GlobeViewer
          satellites={satellites}
          positionsByNoradId={positionsByNoradId}
          selectedNoradId={selectedNoradId}
          selectedDisplayState={selectedDisplayState}
          selectedOrbitPath={selectedOrbitPath}
          onSelectNoradId={handleSelectSatellite}
          loading={loading}
        />

        <SatelliteDetailsPanel
          satellite={selectedSatellite}
          liveState={selectedLiveState}
          isFavorite={selectedSatellite ? isFavoriteNoradId(selectedSatellite.noradId) : false}
          onToggleFavorite={handleToggleFavorite}
          lastRefreshAt={status?.lastRefreshAt}
        />
      </main>

      <StatusBar status={status} matchingCount={matchingCount} displayedCount={satellites.length} />

      {(refreshError || status?.lastError) && (
        <div style={{ padding: "0 1rem 1rem", color: "var(--danger)" }}>
          {refreshError || status?.lastError}
        </div>
      )}

      {!refreshError &&
        (status?.refreshState === "stale" || status?.refreshState === "blocked") &&
        status?.lastWarning && (
        <div style={{ padding: "0 1rem 1rem", color: "var(--warning)" }}>{status.lastWarning}</div>
      )}
    </div>
  );
}
