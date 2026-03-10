import { SatellitesCollection } from "/imports/api/satellites/satellites";
import { computeSatelliteState } from "/imports/lib/orbit/propagation";

export async function refreshSatelliteLiveSamples(sampledAt = new Date()) {
  const rawCollection = SatellitesCollection.rawCollection();
  const records = await rawCollection
    .find(
      {},
      {
        projection: {
          _id: 1,
          noradId: 1,
          updatedAt: 1,
          epoch: 1,
          tleLine1: 1,
          tleLine2: 1,
          omm: 1,
        },
      },
    )
    .toArray();

  const operations = records
    .map((record) => {
      const liveSample = computeSatelliteState(record, sampledAt);

      if (!liveSample) {
        return null;
      }

      return {
        updateOne: {
          filter: { _id: record._id },
          update: {
            $set: {
              liveSample,
              "orbit.currentAltitudeKm": liveSample.altitudeKm,
              "orbit.sampledAt": sampledAt,
            },
          },
        },
      };
    })
    .filter(Boolean);

  if (!operations.length) {
    return { updatedCount: 0 };
  }

  await rawCollection.bulkWrite(operations, { ordered: false });

  return { updatedCount: operations.length };
}
