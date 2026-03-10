import { computeOrbitMetrics, computeSatelliteState } from "/imports/lib/orbit/propagation";

function asNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeOmmRecord(ommRecord) {
  if (!ommRecord) {
    return null;
  }

  return {
    OBJECT_NAME: ommRecord.OBJECT_NAME || null,
    OBJECT_ID: ommRecord.OBJECT_ID || null,
    EPOCH: ommRecord.EPOCH || null,
    MEAN_MOTION: asNumber(ommRecord.MEAN_MOTION),
    ECCENTRICITY: asNumber(ommRecord.ECCENTRICITY),
    INCLINATION: asNumber(ommRecord.INCLINATION),
    RA_OF_ASC_NODE: asNumber(ommRecord.RA_OF_ASC_NODE),
    ARG_OF_PERICENTER: asNumber(ommRecord.ARG_OF_PERICENTER),
    MEAN_ANOMALY: asNumber(ommRecord.MEAN_ANOMALY),
    BSTAR: asNumber(ommRecord.BSTAR),
    EPHEMERIS_TYPE: ommRecord.EPHEMERIS_TYPE ?? null,
    CLASSIFICATION_TYPE: ommRecord.CLASSIFICATION_TYPE || null,
    NORAD_CAT_ID: asNumber(ommRecord.NORAD_CAT_ID),
    ELEMENT_SET_NO: asNumber(ommRecord.ELEMENT_SET_NO),
    REV_AT_EPOCH: asNumber(ommRecord.REV_AT_EPOCH),
    MEAN_MOTION_DOT: asNumber(ommRecord.MEAN_MOTION_DOT),
    MEAN_MOTION_DDOT: asNumber(ommRecord.MEAN_MOTION_DDOT),
  };
}

function parseLine2Number(line2, start, end, prefix = "") {
  if (typeof line2 !== "string") {
    return null;
  }

  return asNumber(`${prefix}${line2.slice(start, end)}`);
}

export function normalizeSatelliteRecord({
  jsonRecord,
  tleRecord,
  fetchedAt = new Date(),
  source,
}) {
  const omm = normalizeOmmRecord(jsonRecord);
  const noradId = asNumber(jsonRecord?.NORAD_CAT_ID) || tleRecord?.noradId;
  const name = jsonRecord?.OBJECT_NAME || tleRecord?.name || `STARLINK-${noradId}`;
  const epoch = jsonRecord?.EPOCH ? new Date(jsonRecord.EPOCH) : tleRecord?.epoch || null;
  const orbit = computeOrbitMetrics({
    meanMotion: omm?.MEAN_MOTION ?? parseLine2Number(tleRecord?.tleLine2, 52, 63),
    eccentricity: omm?.ECCENTRICITY ?? parseLine2Number(tleRecord?.tleLine2, 26, 33, "0."),
    inclination: omm?.INCLINATION ?? parseLine2Number(tleRecord?.tleLine2, 8, 16),
  });

  const candidate = {
    noradId,
    name,
    intlDes: jsonRecord?.OBJECT_ID || tleRecord?.intlDes || null,
    epoch,
    tleLine1: tleRecord?.tleLine1 || null,
    tleLine2: tleRecord?.tleLine2 || null,
    omm,
    orbit,
    source,
    updatedAt: fetchedAt,
    refreshMeta: {
      lastIngestedAt: fetchedAt,
      ingestionFormat: source?.format || "unknown",
    },
  };

  const liveSample = computeSatelliteState(candidate, fetchedAt);

  if (liveSample) {
    candidate.liveSample = liveSample;
    candidate.orbit = {
      ...(candidate.orbit || {}),
      currentAltitudeKm: liveSample.altitudeKm,
      sampledAt: fetchedAt,
    };
  }

  return candidate;
}
