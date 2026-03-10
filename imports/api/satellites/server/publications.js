import { Meteor } from "meteor/meteor";
import {
  SATELLITE_DETAIL_FIELDS,
  SATELLITE_PUBLIC_FIELDS,
  SatellitesCollection,
} from "/imports/api/satellites/satellites";
import { sanitizeFilters, validateNoradId } from "/imports/api/satellites/validation";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSatelliteQuery(filters) {
  const query = {
    $and: [
      {
        $or: [
          { "orbit.currentAltitudeKm": { $gte: filters.altitudeMinKm, $lte: filters.altitudeMaxKm } },
          { "orbit.meanAltitudeKm": { $gte: filters.altitudeMinKm, $lte: filters.altitudeMaxKm } },
        ],
      },
    ],
  };

  if (filters.searchText) {
    const escapedSearch = escapeRegExp(filters.searchText);
    const searchRegex = new RegExp(escapedSearch, "i");
    const numericSearch = Number.parseInt(filters.searchText, 10);

    query.$and.push({
      $or: [
        { name: searchRegex },
        ...(Number.isFinite(numericSearch) ? [{ noradId: numericSearch }] : []),
      ],
    });
  }

  if (filters.favoritesOnly) {
    query.$and.push({
      noradId: {
        $in: filters.favoriteNoradIds.length ? filters.favoriteNoradIds : [-1],
      },
    });
  }

  return query;
}

Meteor.publish("satellites.filtered", function publishSatellitesFiltered(rawFilters = {}) {
  const filters = sanitizeFilters(rawFilters);
  const query = buildSatelliteQuery(filters);

  return SatellitesCollection.find(query, {
    fields: SATELLITE_PUBLIC_FIELDS,
    limit: filters.maxVisible,
    sort: {
      "orbit.currentAltitudeKm": 1,
      noradId: 1,
    },
  });
});

Meteor.publish("satellites.filteredCount", function publishSatellitesFilteredCount(rawFilters = {}) {
  const filters = sanitizeFilters(rawFilters);
  const query = buildSatelliteQuery(filters);
  const cursor = SatellitesCollection.find(query, { fields: { _id: 1 } });
  const publication = this;
  const publicationId = "current";
  let matchingCount = 0;
  let initializing = true;

  const observer = cursor.observeChanges({
    added() {
      matchingCount += 1;

      if (!initializing) {
        publication.changed("satelliteCounts", publicationId, {
          matchingCount,
          displayedCount: Math.min(matchingCount, filters.maxVisible),
        });
      }
    },
    removed() {
      matchingCount = Math.max(0, matchingCount - 1);
      publication.changed("satelliteCounts", publicationId, {
        matchingCount,
        displayedCount: Math.min(matchingCount, filters.maxVisible),
      });
    },
  });

  initializing = false;

  publication.added("satelliteCounts", publicationId, {
    matchingCount,
    displayedCount: Math.min(matchingCount, filters.maxVisible),
  });
  publication.ready();

  publication.onStop(() => observer.stop());
});

Meteor.publish("satellites.single", function publishSingleSatellite(noradId) {
  validateNoradId(noradId);

  return SatellitesCollection.find(
    { noradId },
    {
      fields: SATELLITE_DETAIL_FIELDS,
      limit: 1,
    },
  );
});
