import { Mongo } from "meteor/mongo";

export const SatellitesCollection = new Mongo.Collection("satellites");

// Shared ordering for the constellation list: shell altitude first, then a
// stable NORAD tiebreak. Used by both the filtered publication and the client
// fetch so the two never drift; the matching index lives in startup/server.
export const SATELLITE_SORT = {
  "orbit.currentAltitudeKm": 1,
  noradId: 1,
};

export const SATELLITE_PUBLIC_FIELDS = {
  _id: 1,
  name: 1,
  noradId: 1,
  epoch: 1,
  updatedAt: 1,
  tleLine1: 1,
  tleLine2: 1,
  omm: 1,
  orbit: 1,
  liveSample: 1,
};

export const SATELLITE_DETAIL_FIELDS = {
  ...SATELLITE_PUBLIC_FIELDS,
  intlDes: 1,
  source: 1,
  refreshMeta: 1,
};
