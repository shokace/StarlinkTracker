import { parseTleFeed } from "/imports/lib/orbit/tle";

const CELESTRAK_JSON_URL =
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=json";
const CELESTRAK_SUPGP_TLE_URL =
  "https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=tle";

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
  let jsonRecords = [];
  let jsonError = null;

  try {
    const jsonResult = await fetchWithTimeout(CELESTRAK_JSON_URL, timeoutMs).then((response) =>
      response.json(),
    );
    jsonRecords = Array.isArray(jsonResult) ? jsonResult : [];
  } catch (error) {
    jsonError = error;
  }

  if (jsonRecords.length) {
    return {
      format: "json",
      jsonError,
      tleError: null,
      jsonRecords,
      tleRecords: [],
      source: {
        provider: "CelesTrak",
        group: "starlink",
        jsonUrl: CELESTRAK_JSON_URL,
        tleUrl: CELESTRAK_SUPGP_TLE_URL,
      },
    };
  }

  let tleRecords = [];
  let tleError = null;

  try {
    const tleText = await fetchWithTimeout(CELESTRAK_SUPGP_TLE_URL, timeoutMs).then((response) =>
      response.text(),
    );
    tleRecords = parseTleFeed(tleText);
  } catch (error) {
    tleError = error;
  }

  if (!jsonRecords.length && !tleRecords.length) {
    throw new Error(
      `Unable to fetch Starlink catalog. JSON: ${formatFeedError(jsonError)}. Supplemental TLE: ${formatFeedError(tleError)}.`,
    );
  }

  return {
    format: "tle",
    jsonError,
    tleError,
    jsonRecords,
    tleRecords,
    source: {
      provider: "CelesTrak Supplemental GP",
      group: "starlink",
      jsonUrl: CELESTRAK_JSON_URL,
      tleUrl: CELESTRAK_SUPGP_TLE_URL,
    },
  };
}
