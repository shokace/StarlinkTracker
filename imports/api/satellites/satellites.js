import { Mongo } from "meteor/mongo";

export const SatellitesCollection = new Mongo.Collection("satellites");

export const SATELLITE_PUBLIC_FIELDS = {
  _id: 1,
  name: 1,
  noradId: 1,
  intlDes: 1,
  epoch: 1,
  tleLine1: 1,
  tleLine2: 1,
  omm: 1,
  orbit: 1,
  liveSample: 1,
  source: 1,
  updatedAt: 1,
};

export const SATELLITE_DETAIL_FIELDS = {
  ...SATELLITE_PUBLIC_FIELDS,
  refreshMeta: 1,
};
