import { SatellitesCollection } from "/imports/api/satellites/satellites";
import { LIVE_SAMPLE_BATCH_SIZE } from "/imports/api/satellites/constants";
import { computeSatelliteState } from "/imports/lib/orbit/propagation";

let activeLiveSampleRefreshPromise = null;

function chunkArray(values, chunkSize) {
  const chunks = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

export async function refreshSatelliteLiveSamples(sampledAt = new Date()) {
  if (activeLiveSampleRefreshPromise) {
    return activeLiveSampleRefreshPromise;
  }

  const rawCollection = SatellitesCollection.rawCollection();
  activeLiveSampleRefreshPromise = (async () => {
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

    const batches = chunkArray(operations, LIVE_SAMPLE_BATCH_SIZE);

    for (const batch of batches) {
      await rawCollection.bulkWrite(batch, { ordered: false });
    }

    return {
      updatedCount: operations.length,
      batchCount: batches.length,
    };
  })();

  try {
    return await activeLiveSampleRefreshPromise;
  } finally {
    activeLiveSampleRefreshPromise = null;
  }
}
