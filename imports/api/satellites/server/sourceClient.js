import { parseTleFeed } from "/imports/lib/orbit/tle";

const CELESTRAK_JSON_URL =
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=json";
const CELESTRAK_TLE_URL =
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle";

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

export async function fetchCelesTrakStarlinkCatalog({ timeoutMs = 15000 } = {}) {
  let jsonRecords = [];
  let format = "json";
  let jsonError = null;

  try {
    const jsonResponse = await fetchWithTimeout(CELESTRAK_JSON_URL, timeoutMs);
    jsonRecords = await jsonResponse.json();
  } catch (error) {
    jsonError = error;
    format = "tle";
  }

  const tleResponse = await fetchWithTimeout(CELESTRAK_TLE_URL, timeoutMs);
  const tleText = await tleResponse.text();
  const tleRecords = parseTleFeed(tleText);

  return {
    format,
    jsonError,
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
