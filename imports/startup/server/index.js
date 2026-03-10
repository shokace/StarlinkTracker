import { Meteor } from "meteor/meteor";
import "/imports/api/satellites/server/publications";
import "/imports/api/satellites/server/methods";
import "/imports/api/status/server/publications";
import {
  CELESTRAK_MIN_REFRESH_INTERVAL_MS,
  DEFAULT_REFRESH_INTERVAL_MS,
  LIVE_SAMPLE_REFRESH_INTERVAL_MS,
  STATUS_DOC_ID,
} from "/imports/api/satellites/constants";
import { refreshSatelliteLiveSamples } from "/imports/api/satellites/server/liveSamples";
import { SatellitesCollection } from "/imports/api/satellites/satellites";
import { refreshStarlinkCatalog } from "/imports/api/satellites/server/ingest";
import { StatusCollection } from "/imports/api/status/status";

async function ensureIndexes() {
  const rawCollection = SatellitesCollection.rawCollection();
  await rawCollection.createIndex({ noradId: 1 }, { unique: true });
  await rawCollection.createIndex({ name: 1 });
  await rawCollection.createIndex({ "orbit.currentAltitudeKm": 1 });
  await rawCollection.createIndex({ "orbit.meanAltitudeKm": 1 });
}

async function ensureStatusDocument() {
  await StatusCollection.upsertAsync(
    { _id: STATUS_DOC_ID },
    {
      $setOnInsert: {
        source: "CelesTrak",
        totalSatellites: 0,
        refreshInProgress: false,
        refreshState: "idle",
        createdAt: new Date(),
      },
    },
  );
}

Meteor.startup(async () => {
  await ensureIndexes();
  await ensureStatusDocument();

  Meteor.defer(() => {
    refreshStarlinkCatalog({ trigger: "startup" }).catch((error) => {
      console.error("[starlink] Startup refresh failed", error);
    });
  });

  const refreshIntervalMs =
    Math.max(
      Number(process.env.ORBIT_REFRESH_INTERVAL_MS) || DEFAULT_REFRESH_INTERVAL_MS,
      CELESTRAK_MIN_REFRESH_INTERVAL_MS,
    );

  Meteor.setInterval(() => {
    refreshStarlinkCatalog({ trigger: "scheduled" }).catch((error) => {
      console.error("[starlink] Scheduled refresh failed", error);
    });
  }, refreshIntervalMs);

  Meteor.setInterval(() => {
    refreshSatelliteLiveSamples().catch((error) => {
      console.error("[starlink] Live sample refresh failed", error);
    });
  }, LIVE_SAMPLE_REFRESH_INTERVAL_MS);
});
