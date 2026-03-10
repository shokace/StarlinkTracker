import { ReactiveVar } from "meteor/reactive-var";

const STORAGE_KEY = "starlink.favoriteNoradIds";
const favoriteIdsVar = new ReactiveVar(loadFavorites());

function loadFavorites() {
  if (typeof localStorage === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(Number.isInteger) : [];
  } catch (error) {
    console.warn("[favorites] Failed to read local favorites", error);
    return [];
  }
}

function persistFavorites(nextFavoriteIds) {
  favoriteIdsVar.set(nextFavoriteIds);

  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextFavoriteIds));
  }
}

export function getFavoriteNoradIds() {
  return favoriteIdsVar.get();
}

export function isFavoriteNoradId(noradId) {
  return favoriteIdsVar.get().includes(noradId);
}

export function toggleFavoriteNoradId(noradId) {
  const currentIds = favoriteIdsVar.get();
  const nextIds = currentIds.includes(noradId)
    ? currentIds.filter((candidateId) => candidateId !== noradId)
    : [...currentIds, noradId].sort((left, right) => left - right);

  persistFavorites(nextIds);
  return nextIds;
}
