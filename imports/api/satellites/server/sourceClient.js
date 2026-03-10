import { parseTleFeed } from "/imports/lib/orbit/tle";

const CELESTRAK_JSON_URL =
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=json";
const CELESTRAK_TLE_URL =
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle";

function isTimeoutError(error) {
  return (
    error?.name === "TimeoutError" ||
    error?.name === "AbortError" ||
    /timeout/i.test(error?.message || "")
  );
}

function formatFeedError(error) {
  if (!error) {
    return "unknown error";
  }

  return isTimeoutError(error) ? "request timed out" : error.message || "request failed";
}

async function fetchWithTimeout(url, timeoutMs) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "user-agent": "Starlink-Constellation-Visualizer/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Feed request failed with ${response.status} ${response.statusText}`);
  }

  return response;
}

export async function fetchCelesTrakStarlinkCatalog({ timeoutMs = 30000 } = {}) {
  const [jsonResult, tleResult] = await Promise.allSettled([
    fetchWithTimeout(CELESTRAK_JSON_URL, timeoutMs).then((response) => response.json()),
    fetchWithTimeout(CELESTRAK_TLE_URL, timeoutMs)
      .then((response) => response.text())
      .then((tleText) => parseTleFeed(tleText)),
  ]);

  const jsonRecords = jsonResult.status === "fulfilled" && Array.isArray(jsonResult.value)
    ? jsonResult.value
    : [];
  const tleRecords = tleResult.status === "fulfilled" ? tleResult.value : [];
  const jsonError = jsonResult.status === "rejected" ? jsonResult.reason : null;
  const tleError = tleResult.status === "rejected" ? tleResult.reason : null;

  if (!jsonRecords.length && !tleRecords.length) {
    throw new Error(
      `Unable to fetch Starlink catalog. JSON: ${formatFeedError(jsonError)}. TLE: ${formatFeedError(tleError)}.`,
    );
  }

  const format = jsonRecords.length ? "json" : "tle";

  return {
    format,
    jsonError,
    tleError,
    jsonRecords: Array.isArray(jsonRecords) ? jsonRecords : [],
    tleRecords,
    source: {
      provider: "CelesTrak",
      group: "starlink",
      jsonUrl: CELESTRAK_JSON_URL,
      tleUrl: CELESTRAK_TLE_URL,
    },
  };
}
