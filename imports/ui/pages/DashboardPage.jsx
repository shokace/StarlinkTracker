import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { startTransition, useDeferredValue, useEffect, useState } from "react";
import {
  CLIENT_PROPAGATION_INTERVAL_MS,
  DEFAULT_ALTITUDE_MAX_KM,
  DEFAULT_ALTITUDE_MIN_KM,
  DEFAULT_MAX_VISIBLE,
  FORECAST_HORIZON_MS,
  FORECAST_PLAYBACK_RATE,
  FORECAST_PLAYBACK_TICK_MS,
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
import { useApproximateLocation } from "/imports/ui/hooks/useApproximateLocation";
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
      .slice(0, Number.isFinite(filters.maxVisible) ? filters.maxVisible : undefined);
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
  const [forecastState, setForecastState] = useState({
    isOpen: false,
    isPlaying: false,
    offsetMs: 0,
    anchorTime: null,
  });
  const deferredSearchText = useDeferredValue(filters.searchText);
  const currentTime = useCurrentTime(CLIENT_PROPAGATION_INTERVAL_MS);
  const approximateLocation = useApproximateLocation();
  const reactiveFilters = {
    ...filters,
    searchText: deferredSearchText,
  };
  const { favoriteNoradIds, satellites, selectedSatellite, matchingCount, status, loading } =
    useDashboardData(reactiveFilters, selectedNoradId);
  const displayTime =
    forecastState.isOpen && forecastState.anchorTime
      ? new Date(forecastState.anchorTime.getTime() + forecastState.offsetMs)
      : currentTime;
  const positionTransitionMs =
    forecastState.isOpen && forecastState.isPlaying
      ? FORECAST_PLAYBACK_TICK_MS
      : CLIENT_PROPAGATION_INTERVAL_MS;
  const positionsByNoradId = new Map();

  satellites.forEach((satellite) => {
    const propagatedState = computeSatelliteState(satellite, displayTime) || satellite.liveSample;

    if (propagatedState) {
      positionsByNoradId.set(satellite.noradId, propagatedState);
    }
  });

  const selectedLiveState = selectedSatellite
    ? positionsByNoradId.get(selectedSatellite.noradId) ||
      computeSatelliteState(selectedSatellite, displayTime) ||
      selectedSatellite.liveSample
    : null;
  const selectedDisplayState = selectedNoradId ? positionsByNoradId.get(selectedNoradId) : null;
  const selectedOrbitPath = selectedSatellite
    ? sampleOrbitPath(selectedSatellite, {
        startDate: displayTime,
        sampleCount: SELECTED_ORBIT_PATH_SAMPLE_COUNT,
        stepSeconds: SELECTED_ORBIT_PATH_STEP_SECONDS,
      })
    : [];

  useEffect(() => {
    if (selectedNoradId && !selectedSatellite && !loading) {
      setSelectedNoradId(null);
    }
  }, [loading, selectedNoradId, selectedSatellite]);

  useEffect(() => {
    if (!forecastState.isOpen || !forecastState.isPlaying) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setForecastState((currentForecastState) => {
        if (!currentForecastState.isOpen || !currentForecastState.isPlaying) {
          return currentForecastState;
        }

        const nextOffsetMs =
          currentForecastState.offsetMs + FORECAST_PLAYBACK_TICK_MS * FORECAST_PLAYBACK_RATE;

        if (nextOffsetMs >= FORECAST_HORIZON_MS) {
          return {
            isOpen: false,
            isPlaying: false,
            offsetMs: 0,
            anchorTime: null,
          };
        }

        return {
          ...currentForecastState,
          offsetMs: nextOffsetMs,
        };
      });
    }, FORECAST_PLAYBACK_TICK_MS);

    return () => window.clearInterval(intervalId);
  }, [forecastState.isOpen, forecastState.isPlaying]);

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

  function handleEnterForecastMode() {
    setForecastState({
      isOpen: true,
      isPlaying: false,
      offsetMs: 0,
      anchorTime: new Date(currentTime),
    });
  }

  function handleReturnLiveMode() {
    setForecastState({
      isOpen: false,
      isPlaying: false,
      offsetMs: 0,
      anchorTime: null,
    });
  }

  function handleToggleForecastPlayback() {
    setForecastState((currentForecastState) => ({
      isOpen: true,
      isPlaying: !currentForecastState.isPlaying,
      offsetMs: currentForecastState.offsetMs,
      anchorTime: currentForecastState.anchorTime || new Date(currentTime),
    }));
  }

  function handleForecastSeek(offsetMs) {
    setForecastState((currentForecastState) => ({
      isOpen: true,
      isPlaying: false,
      offsetMs,
      anchorTime: currentForecastState.anchorTime || new Date(currentTime),
    }));
  }

  return (
    <div className="app-shell">
      <AppHeader status={status} />

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
          displayTime={displayTime}
          isForecastMode={forecastState.isOpen}
          isForecastPlaying={forecastState.isPlaying}
          forecastOffsetMs={forecastState.offsetMs}
          forecastHorizonMs={FORECAST_HORIZON_MS}
          positionTransitionMs={positionTransitionMs}
          selectedNoradId={selectedNoradId}
          selectedDisplayState={selectedDisplayState}
          selectedOrbitPath={selectedOrbitPath}
          approximateUserLocation={approximateLocation.location}
          locationStatus={approximateLocation.status}
          locationErrorMessage={approximateLocation.errorMessage}
          onRequestLocation={approximateLocation.requestLocation}
          onEnterForecastMode={handleEnterForecastMode}
          onReturnLiveMode={handleReturnLiveMode}
          onToggleForecastPlayback={handleToggleForecastPlayback}
          onForecastSeek={handleForecastSeek}
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

      {status?.lastError && (
        <div style={{ padding: "0 1rem 1rem", color: "var(--danger)" }}>
          {status.lastError}
        </div>
      )}

      {status?.refreshState === "stale" && status?.lastWarning && (
        <div style={{ padding: "0 1rem 1rem", color: "var(--warning)" }}>{status.lastWarning}</div>
      )}
    </div>
  );
}
