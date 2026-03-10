# Starlink Constellation Visualizer

Starlink Constellation Visualizer is a production-style Meteor 3 + React application that ingests public Starlink orbital data, normalizes it into MongoDB, publishes filterable subsets reactively, and renders live estimated satellite positions on a CesiumJS 3D globe using `satellite.js`.

This repo is intentionally built to demonstrate Meteor strengths instead of generic SPA patterns:

- Mongo collections as the normalized application data layer
- Meteor Methods for refresh control and favorite interactions
- Meteor publish/subscribe for lean, validated, reactive payloads
- client/server separation with imports-based structure
- reactive UI updates driven by Minimongo and Tracker-aware React hooks

## What The App Does

- Fetches public Starlink orbital element data from CelesTrak
- Prefers modern GP JSON / OMM-style records when available
- Falls back to TLE ingestion if JSON is unavailable
- Normalizes satellite records into MongoDB with derived orbital metadata
- Refreshes automatically on the server and manually through a Meteor Method
- Publishes filtered subsets to clients via `satellites.filtered`
- Publishes a selected satellite via `satellites.single`
- Publishes system refresh state via `app.status`
- Renders live estimated positions on a Cesium globe
- Supports search, altitude filtering, favorites filtering, and display caps

## Why Meteor Is A Good Fit

This application is a good Meteor use case because the UI needs a small, reactive subset of a larger real-time-ish dataset. Meteor’s data flow makes that straightforward:

- The server owns ingestion, normalization, validation, and persistence.
- Clients subscribe only to the currently relevant satellite subset.
- Minimongo updates the React UI reactively without additional state-management infrastructure.
- Status updates, refresh state, and selected-detail views are naturally reactive through publications.

## Architecture Overview

```text
client/
server/
imports/
  api/
    satellites/
      satellites.js
      satelliteCounts.js
      validation.js
      server/
        ingest.js
        methods.js
        normalizers.js
        publications.js
        sourceClient.js
    status/
      status.js
      server/publications.js
  lib/
    orbit/
      propagation.js
      tle.js
  startup/
    server/index.js
  ui/
    components/
    hooks/
    pages/
    state/
scripts/
  sync-cesium-assets.mjs
```

## Data Flow Overview

1. Server startup imports publications, methods, indexes, and the refresh scheduler.
2. `refreshStarlinkCatalog` fetches CelesTrak Starlink data.
3. The ingestion layer normalizes records and bulk-upserts them into MongoDB.
4. The app updates the `app_status` collection with refresh timestamps, counts, and failures.
5. The client subscribes to:
   - `satellites.filtered`
   - `satellites.filteredCount`
   - `satellites.single`
   - `app.status`
6. React reads Minimongo via `useTracker`.
7. The globe computes live positions locally from orbital elements using `satellite.js`.

## Orbital Data Ingestion

Source:

- Primary: CelesTrak Starlink GP JSON feed
- Companion / fallback: CelesTrak Starlink TLE feed

Server ingestion responsibilities:

- fetch source data with timeout handling
- parse TLE text when needed
- normalize OMM/TLE fields into a stable Mongo schema
- derive orbital metadata such as:
  - inclination
  - eccentricity
  - mean motion
  - semi-major axis
  - perigee / apogee / mean altitude
  - orbital category
- compute a snapshot altitude sample for server-side altitude filtering
- bulk-upsert records
- remove stale records from the same provider
- store refresh health in `app_status`

If the remote feed is unavailable and the database is empty, the app seeds a tiny bundled fallback catalog so the UI still comes up during development.

## Live Position Computation

The app does not call a third-party “position API.”

Instead:

- orbital elements are stored in MongoDB
- the client receives only the currently subscribed subset
- `satellite.js` propagates each visible satellite locally
- Cesium entities update once per second

For selected satellites, the UI also samples a short future orbit path to render an orbital arc on the globe.

All displayed positions are estimates derived from public orbital element sets, not direct telemetry.

## Meteor Publications

- `satellites.filtered`
  - validates filter arguments
  - publishes only fields needed for rendering and details
  - applies search, altitude, favorites, and limit constraints on the server
- `satellites.filteredCount`
  - publishes a reactive count document for the active filter set
- `satellites.single`
  - publishes one satellite by NORAD ID for the details panel
- `app.status`
  - publishes ingestion / refresh status

## Meteor Methods

- `satellites.refreshNow`
  - manually triggers a refresh
- `satellites.toggleFavorite`
  - validates the interaction and supports the local-only favorites fallback

Favorites are intentionally local-only in this version to keep the app focused on Meteor data flow and orbital ingestion. The method interface leaves a clean path to swap in Meteor Accounts later.

## Cesium Setup

Cesium static assets are copied into `public/cesium` by `scripts/sync-cesium-assets.mjs` via `npm postinstall`.

The client sets:

- `window.CESIUM_BASE_URL = "/cesium"`

and imports the Cesium widgets CSS directly.

## Setup

### Prerequisites

- Node.js 20+
- Meteor 3.4+

Meteor install:

- Official docs: [docs.meteor.com/about/install.html](https://docs.meteor.com/about/install.html)

### Install

```bash
npm install
```

### Run

```bash
meteor
```

or:

```bash
npm start
```

### Test

```bash
npm test
```

## Environment Variables

- `ORBIT_REFRESH_INTERVAL_MS`
  - optional server refresh cadence
  - default: 2 hours
  - note: for CelesTrak GP feeds, values below 2 hours are clamped up to 2 hours to avoid provider blocks
- `ORBIT_FETCH_TIMEOUT_MS`
  - optional feed timeout in milliseconds
  - default: 30000

## Performance Notes

- The UI defaults to a server-side display cap of 250 satellites.
- The max visible control tops out at 1000.
- The globe updates positions once per second instead of every animation frame.
- The main publication only sends the current subset, not the entire Starlink catalog.

This keeps the initial experience responsive while still demonstrating a live constellation view.

## Limitations

- Orbital positions are estimated from public element sets and can drift from actual spacecraft locations.
- Server-side altitude filtering uses the most recent ingested propagated altitude snapshot, while the client globe updates positions continuously.
- Favorites are local-only and stored in browser storage.
- The current UI focuses on desktop / portfolio presentation rather than exhaustive operational tooling.

## Future Improvements

- Add minimal Meteor Accounts for user-bound favorites
- Add source adapters for Space-Track and SupGP variants
- Add server-side admin authorization for manual refresh
- Add orbital shell classification tuned to known Starlink shell definitions
- Add entity clustering / instancing for even larger visible counts
- Add richer test coverage for ingestion and publication filtering

## Portfolio / Interview Talking Points

This project demonstrates:

- Meteor pub/sub design beyond autopublish
- validated method and publication inputs
- Mongo schema discipline with normalized records and derived fields
- server-side external data ingestion and bulk upserts
- reactive status reporting through a dedicated collection
- client/server separation in an imports-based Meteor 3 codebase
- Cesium integration inside a Meteor app
- local orbital propagation with `satellite.js` rather than outsourcing computation
