import { Match, check } from "meteor/check";
import {
  DEFAULT_ALTITUDE_MAX_KM,
  DEFAULT_ALTITUDE_MIN_KM,
  DEFAULT_MAX_VISIBLE,
  MAX_VISIBLE_HARD_LIMIT,
} from "/imports/api/satellites/constants";

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function validateNoradId(noradId) {
  check(noradId, Match.Integer);
  return noradId;
}

export function sanitizeFilters(rawFilters = {}) {
  check(
    rawFilters,
    Match.ObjectIncluding({
      searchText: Match.Maybe(String),
      altitudeMinKm: Match.Maybe(Number),
      altitudeMaxKm: Match.Maybe(Number),
      favoritesOnly: Match.Maybe(Boolean),
      favoriteNoradIds: Match.Maybe([Match.Integer]),
      maxVisible: Match.Maybe(Match.Integer),
    }),
  );

  const searchText = String(rawFilters.searchText || "").trim().slice(0, 64);
  const altitudeMinKm = clamp(
    Number.isFinite(rawFilters.altitudeMinKm)
      ? rawFilters.altitudeMinKm
      : DEFAULT_ALTITUDE_MIN_KM,
    0,
    3000,
  );
  const altitudeMaxKm = clamp(
    Number.isFinite(rawFilters.altitudeMaxKm)
      ? rawFilters.altitudeMaxKm
      : DEFAULT_ALTITUDE_MAX_KM,
    altitudeMinKm,
    3000,
  );
  const favoriteNoradIds = Array.isArray(rawFilters.favoriteNoradIds)
    ? [...new Set(rawFilters.favoriteNoradIds)].slice(0, MAX_VISIBLE_HARD_LIMIT)
    : [];

  return {
    searchText,
    altitudeMinKm,
    altitudeMaxKm,
    favoritesOnly: Boolean(rawFilters.favoritesOnly),
    favoriteNoradIds,
    maxVisible: clamp(
      Number.isFinite(rawFilters.maxVisible) ? rawFilters.maxVisible : DEFAULT_MAX_VISIBLE,
      25,
      MAX_VISIBLE_HARD_LIMIT,
    ),
  };
}
