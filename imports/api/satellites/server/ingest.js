import { Meteor } from "meteor/meteor";
import { SatellitesCollection } from "/imports/api/satellites/satellites";
import {
  CELESTRAK_BLOCK_COOLDOWN_MS,
  CELESTRAK_MIN_REFRESH_INTERVAL_MS,
  STATUS_DOC_ID,
} from "/imports/api/satellites/constants";
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

  if (Number.isFinite(configuredInterval) && configuredInterval > 0) {
    return Math.max(configuredInterval, CELESTRAK_MIN_REFRESH_INTERVAL_MS);
  }

  return CELESTRAK_MIN_REFRESH_INTERVAL_MS;
}

function isAccessBlockedError(error) {
  return /\b403\b|forbidden/i.test(error?.message || "");
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
    timeoutMs: Number(process.env.ORBIT_FETCH_TIMEOUT_MS) || 30000,
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
    const statusDoc = await StatusCollection.findOneAsync(STATUS_DOC_ID);
    const refreshBlockedUntil = statusDoc?.refreshBlockedUntil
      ? new Date(statusDoc.refreshBlockedUntil)
      : null;

    if (refreshBlockedUntil && refreshBlockedUntil > startedAt) {
      const message = `CelesTrak is temporarily blocking refreshes. Using cached orbital data until ${refreshBlockedUntil.toLocaleString()}.`;

      await updateStatus({
        totalSatellites:
          statusDoc?.totalSatellites ?? (await SatellitesCollection.find().countAsync()),
        refreshInProgress: false,
        refreshState: "blocked",
        lastError: null,
        lastWarning: message,
        nextRefreshAt: refreshBlockedUntil,
        lastTrigger: trigger,
      });

      return {
        totalSatellites: statusDoc?.totalSatellites ?? 0,
        blocked: true,
        stale: true,
        format: "cached",
        nextRefreshAt: refreshBlockedUntil,
        message,
      };
    }

    await updateStatus({
      refreshInProgress: true,
      lastAttemptAt: startedAt,
      lastTrigger: trigger,
      refreshState: "running",
    });

    logInfo("Starting Starlink catalog refresh", { trigger });

    try {
      let normalizedCatalog;
      const existingCount = await SatellitesCollection.find().countAsync();

      try {
        normalizedCatalog = await fetchNormalizedCatalog(startedAt);
      } catch (error) {
        if (existingCount > 0) {
          const failedAt = new Date();
          const durationMs = failedAt.getTime() - startedAt.getTime();
          const blocked = isAccessBlockedError(error);
          const refreshBlockedUntil = blocked
            ? new Date(failedAt.getTime() + CELESTRAK_BLOCK_COOLDOWN_MS)
            : null;
          const warningMessage = blocked
            ? `CelesTrak returned 403 Forbidden. Using cached orbital data until ${refreshBlockedUntil.toLocaleString()}.`
            : "Feed timed out, continuing to use cached orbital data.";

          await updateStatus({
            totalSatellites: existingCount,
            refreshInProgress: false,
            refreshState: blocked ? "blocked" : "stale",
            lastFailureAt: failedAt,
            lastError: null,
            lastWarning: warningMessage,
            refreshBlockedUntil,
            nextRefreshAt: refreshBlockedUntil ||
              (refreshIntervalMs ? new Date(failedAt.getTime() + refreshIntervalMs) : null),
          });

          logError(
            blocked
              ? "Refresh blocked by CelesTrak, keeping existing orbital catalog"
              : "Refresh timed out, keeping existing orbital catalog",
            error,
          );

          return {
            totalSatellites: existingCount,
            durationMs,
            stale: true,
            format: "cached",
            blocked,
            nextRefreshAt: refreshBlockedUntil,
            message: warningMessage,
          };
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
        lastWarning: null,
        refreshBlockedUntil: null,
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
        lastWarning: null,
        refreshBlockedUntil: null,
      });

      logError("Starlink catalog refresh failed", error);
      throw new Meteor.Error("satellites-refresh-failed", error.message);
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}
