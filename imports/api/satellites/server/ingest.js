import { Meteor } from "meteor/meteor";
import { SatellitesCollection } from "/imports/api/satellites/satellites";
import { STATUS_DOC_ID } from "/imports/api/satellites/constants";
import { StatusCollection } from "/imports/api/status/status";
import { FALLBACK_STARLINK_TLES } from "/imports/api/satellites/server/fallbackSeed";
import { normalizeSatelliteRecord } from "/imports/api/satellites/server/normalizers";
import { fetchCelesTrakStarlinkCatalog } from "/imports/api/satellites/server/sourceClient";
import { parseTleFeed } from "/imports/lib/orbit/tle";

let activeRefreshPromise = null;

function logInfo(message, extra = {}) {
  console.info(`[starlink] ${message}`, extra);
}

function logError(message, error) {
  console.error(`[starlink] ${message}`, error);
}

function getRefreshIntervalMs() {
  const configuredInterval = Number(process.env.ORBIT_REFRESH_INTERVAL_MS);
  return Number.isFinite(configuredInterval) && configuredInterval > 0
    ? configuredInterval
    : null;
}

async function updateStatus(fields) {
  const { source = "CelesTrak", ...rest } = fields;

  await StatusCollection.upsertAsync(
    { _id: STATUS_DOC_ID },
    {
      $set: {
        source,
        ...rest,
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
  );
}

async function persistCatalog(records, source, fetchedAt) {
  const rawCollection = SatellitesCollection.rawCollection();
  const operations = records.map((record) => ({
    updateOne: {
      filter: { noradId: record.noradId },
      update: {
        $set: record,
        $setOnInsert: { createdAt: fetchedAt },
      },
      upsert: true,
    },
  }));

  if (operations.length) {
    await rawCollection.bulkWrite(operations, { ordered: false });
  }

  const noradIds = records.map((record) => record.noradId);

  if (noradIds.length) {
    await rawCollection.deleteMany({
      "source.provider": source.provider,
      noradId: { $nin: noradIds },
    });
  }
}

async function buildCatalogFromFallback(fetchedAt) {
  const source = {
    provider: "Fallback Seed",
    format: "tle",
    notes: "Static fallback data bundled for offline development.",
  };
  const tleRecords = parseTleFeed(FALLBACK_STARLINK_TLES);

  return {
    records: tleRecords.map((tleRecord) =>
      normalizeSatelliteRecord({
        tleRecord,
        fetchedAt,
        source,
      }),
    ),
    source,
  };
}

async function fetchNormalizedCatalog(fetchedAt) {
  const feed = await fetchCelesTrakStarlinkCatalog({
    timeoutMs: Number(process.env.ORBIT_FETCH_TIMEOUT_MS) || 15000,
  });
  const tleByNoradId = new Map(feed.tleRecords.map((record) => [record.noradId, record]));
  const source = {
    provider: feed.source.provider,
    format: feed.format,
    group: feed.source.group,
    jsonUrl: feed.source.jsonUrl,
    tleUrl: feed.source.tleUrl,
  };

  let records = [];

  if (feed.jsonRecords.length) {
    records = feed.jsonRecords
      .map((jsonRecord) =>
        normalizeSatelliteRecord({
          jsonRecord,
          tleRecord: tleByNoradId.get(Number(jsonRecord.NORAD_CAT_ID)),
          fetchedAt,
          source,
        }),
      )
      .filter((record) => record.noradId);
  } else {
    records = feed.tleRecords
      .map((tleRecord) =>
        normalizeSatelliteRecord({
          tleRecord,
          fetchedAt,
          source,
        }),
      )
      .filter((record) => record.noradId);
  }

  return {
    feed,
    records,
    source,
  };
}

export async function refreshStarlinkCatalog({ trigger = "manual" } = {}) {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    const startedAt = new Date();
    const refreshIntervalMs = getRefreshIntervalMs();

    await updateStatus({
      refreshInProgress: true,
      lastAttemptAt: startedAt,
      lastTrigger: trigger,
      refreshState: "running",
    });

    logInfo("Starting Starlink catalog refresh", { trigger });

    try {
      let normalizedCatalog;

      try {
        normalizedCatalog = await fetchNormalizedCatalog(startedAt);
      } catch (error) {
        const existingCount = await SatellitesCollection.find().countAsync();

        if (existingCount > 0) {
          throw error;
        }

        logError("Primary feed unavailable, loading fallback sample catalog", error);
        normalizedCatalog = await buildCatalogFromFallback(startedAt);
      }

      await persistCatalog(normalizedCatalog.records, normalizedCatalog.source, startedAt);

      const totalSatellites = await SatellitesCollection.find().countAsync();
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();

      await updateStatus({
        source: normalizedCatalog.source.provider,
        totalSatellites,
        lastRefreshAt: finishedAt,
        lastSuccessAt: finishedAt,
        lastError: null,
        refreshInProgress: false,
        refreshState: "success",
        lastRefreshDurationMs: durationMs,
        lastFormat: normalizedCatalog.source.format,
        nextRefreshAt: refreshIntervalMs ? new Date(finishedAt.getTime() + refreshIntervalMs) : null,
      });

      logInfo("Starlink catalog refresh completed", {
        trigger,
        totalSatellites,
        durationMs,
        format: normalizedCatalog.source.format,
      });

      return {
        totalSatellites,
        durationMs,
        format: normalizedCatalog.source.format,
      };
    } catch (error) {
      const failedAt = new Date();

      await updateStatus({
        refreshInProgress: false,
        refreshState: "failed",
        lastFailureAt: failedAt,
        lastError: error.message,
      });

      logError("Starlink catalog refresh failed", error);
      throw new Meteor.Error("satellites-refresh-failed", error.message);
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}
