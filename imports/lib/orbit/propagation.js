import {
  eciToGeodetic,
  gstime,
  json2satrec,
  propagate,
  radiansToDegrees,
  twoline2satrec,
} from "satellite.js";
import {
  EARTH_GRAVITATIONAL_PARAMETER,
  EARTH_RADIUS_KM,
} from "/imports/lib/orbit/constants";

const satrecCache = new Map();

function getCacheKey(record) {
  return [
    record._id || record.noradId || "unknown",
    record.updatedAt instanceof Date ? record.updatedAt.getTime() : record.epoch?.getTime?.() || 0,
    record.tleLine1 || "",
    record.tleLine2 || "",
  ].join(":");
}

export function buildSatrec(record) {
  const cacheKey = getCacheKey(record);

  if (satrecCache.has(cacheKey)) {
    return satrecCache.get(cacheKey);
  }

  let satrec = null;

  if (record.omm) {
    satrec = json2satrec(record.omm);
  } else if (record.tleLine1 && record.tleLine2) {
    satrec = twoline2satrec(record.tleLine1, record.tleLine2);
  }

  if (satrec) {
    satrecCache.set(cacheKey, satrec);
  }

  return satrec;
}

export function computeOrbitMetrics({
  meanMotion,
  eccentricity,
  inclination,
} = {}) {
  if (!Number.isFinite(meanMotion) || meanMotion <= 0) {
    return null;
  }

  const safeEccentricity = Number.isFinite(eccentricity) ? eccentricity : 0;
  const meanMotionRadiansPerSecond = (meanMotion * 2 * Math.PI) / 86400;
  const semiMajorAxisKm =
    (EARTH_GRAVITATIONAL_PARAMETER / meanMotionRadiansPerSecond ** 2) ** (1 / 3);
  const perigeeAltitudeKm = semiMajorAxisKm * (1 - safeEccentricity) - EARTH_RADIUS_KM;
  const apogeeAltitudeKm = semiMajorAxisKm * (1 + safeEccentricity) - EARTH_RADIUS_KM;
  const meanAltitudeKm = (perigeeAltitudeKm + apogeeAltitudeKm) / 2;

  return {
    inclinationDeg: Number.isFinite(inclination) ? inclination : null,
    eccentricity: safeEccentricity,
    meanMotionRevsPerDay: meanMotion,
    semiMajorAxisKm,
    perigeeAltitudeKm,
    apogeeAltitudeKm,
    meanAltitudeKm,
    periodMinutes: 1440 / meanMotion,
    orbitalCategory: deriveOrbitalCategory(meanAltitudeKm, inclination),
  };
}

export function computeSatelliteState(record, at = new Date()) {
  const satrec = buildSatrec(record);

  if (!satrec) {
    return null;
  }

  const propagated = propagate(satrec, at);

  if (!propagated?.position || !propagated?.velocity) {
    return null;
  }

  const gmst = gstime(at);
  const geodetic = eciToGeodetic(propagated.position, gmst);
  const velocity = propagated.velocity;
  const velocityKms = Math.sqrt(
    velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2,
  );

  return {
    latitudeDeg: radiansToDegrees(geodetic.latitude),
    longitudeDeg: radiansToDegrees(geodetic.longitude),
    altitudeKm: geodetic.height,
    velocityKms,
    sampledAt: at,
  };
}

export function sampleOrbitPath(
  record,
  {
    startDate = new Date(),
    sampleCount = 45,
    stepSeconds = 120,
  } = {},
) {
  const samples = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const at = new Date(startDate.getTime() + index * stepSeconds * 1000);
    const state = computeSatelliteState(record, at);

    if (state) {
      samples.push(state);
    }
  }

  return samples;
}

function deriveOrbitalCategory(meanAltitudeKm, inclination) {
  if (!Number.isFinite(meanAltitudeKm)) {
    return "Unknown";
  }

  const altitudeBand =
    meanAltitudeKm < 450
      ? "LEO Low Shell"
      : meanAltitudeKm < 650
        ? "LEO Operational Shell"
        : "LEO High Shell";

  const inclinationBand =
    Number.isFinite(inclination) && inclination >= 70
      ? "polar"
      : Number.isFinite(inclination) && inclination >= 50
        ? "mid-inclination"
        : "low-inclination";

  return `${altitudeBand} · ${inclinationBand}`;
}
