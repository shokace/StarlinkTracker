import assert from "assert";
import { computeSatelliteState, sampleOrbitPath } from "/imports/lib/orbit/propagation";
import { parseTleFeed } from "/imports/lib/orbit/tle";

const SAMPLE_TLE = `STARLINK-1008
1 44714U 19074B   26069.48979328 -.00000226  00000+0  44881-5 0  9994
2 44714  53.1575 175.0330 0001372  91.8157 268.3001 15.31022046348998`;

describe("Starlink Constellation Visualizer", function () {
  it("package.json has correct name", async function () {
    const { name } = await import("../package.json");
    assert.strictEqual(name, "starlink-constellation-visualizer");
  });

  if (Meteor.isServer) {
    it("parses Starlink TLE text into normalized records", function () {
      const records = parseTleFeed(SAMPLE_TLE);
      assert.strictEqual(records.length, 1);
      assert.strictEqual(records[0].name, "STARLINK-1008");
      assert.strictEqual(records[0].noradId, 44714);
    });

    it("computes a live position from orbital elements", function () {
      const [record] = parseTleFeed(SAMPLE_TLE);
      const state = computeSatelliteState(
        {
          noradId: record.noradId,
          tleLine1: record.tleLine1,
          tleLine2: record.tleLine2,
        },
        new Date("2026-03-10T12:00:00.000Z"),
      );

      assert.ok(state);
      assert.ok(state.altitudeKm > 300);
      assert.ok(state.velocityKms > 6);
    });

    it("samples a short future path for a selected satellite", function () {
      const [record] = parseTleFeed(SAMPLE_TLE);
      const path = sampleOrbitPath(
        {
          noradId: record.noradId,
          tleLine1: record.tleLine1,
          tleLine2: record.tleLine2,
        },
        {
          startDate: new Date("2026-03-10T12:00:00.000Z"),
          sampleCount: 10,
          stepSeconds: 120,
        },
      );

      assert.strictEqual(path.length, 10);
      assert.ok(path.every((sample) => Number.isFinite(sample.longitudeDeg)));
    });
  }
});
