import * as Cesium from "cesium";

const MINIMUM_ELEVATION_DEG = 40;
const MINIMUM_ELEVATION_DOT = Math.sin(Cesium.Math.toRadians(MINIMUM_ELEVATION_DEG));
const horizonNormalScratch = new Cesium.Cartesian3();
const horizonLineOfSightScratch = new Cesium.Cartesian3();

const CAMERA_FOV_DEG = 50;
const DEFAULT_CAMERA_LONGITUDE_DEG = 8;
const DEFAULT_CAMERA_LATITUDE_DEG = 18;
const DEFAULT_CAMERA_HEIGHT_M = 12000000;

const ATMOSPHERE_FADE_START_M = 9000000;
const ATMOSPHERE_FADE_RANGE_M = 18000000;

// Projects a live satellite sample (degrees + km altitude) to an ECEF position.
export function toCartesian(position, altitudeOffsetKm = 0) {
  return Cesium.Cartesian3.fromDegrees(
    position.longitudeDeg,
    position.latitudeDeg,
    (position.altitudeKm + altitudeOffsetKm) * 1000,
  );
}

// Ground-level ECEF position for the coarse user-location marker.
export function getApproximateUserCartesian(position, altitudeOffsetKm = 0) {
  return Cesium.Cartesian3.fromDegrees(
    position.longitudeDeg,
    position.latitudeDeg,
    altitudeOffsetKm * 1000,
  );
}

// True when the satellite is at least MINIMUM_ELEVATION_DEG above the user's
// local horizon. Runs for every visible line at the animation FPS, so it reuses
// scratch buffers and a precomputed threshold to avoid per-call allocation + trig.
export function isAboveUserHorizon(userCartesian, satelliteCartesian) {
  const surfaceNormal = Cesium.Cartesian3.normalize(userCartesian, horizonNormalScratch);
  const userToSatellite = Cesium.Cartesian3.subtract(
    satelliteCartesian,
    userCartesian,
    horizonLineOfSightScratch,
  );
  const normalizedLineOfSight = Cesium.Cartesian3.normalize(userToSatellite, userToSatellite);

  return Cesium.Cartesian3.dot(normalizedLineOfSight, surfaceNormal) >= MINIMUM_ELEVATION_DOT;
}

// Frames the whole globe from a fixed top-down vantage point.
export function applyDefaultCameraView(viewer) {
  if (!viewer || viewer.isDestroyed()) {
    return;
  }

  viewer.camera.frustum.fov = Cesium.Math.toRadians(CAMERA_FOV_DEG);
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(
      DEFAULT_CAMERA_LONGITUDE_DEG,
      DEFAULT_CAMERA_LATITUDE_DEG,
      DEFAULT_CAMERA_HEIGHT_M,
    ),
    orientation: {
      heading: 0,
      pitch: -Cesium.Math.PI_OVER_TWO,
      roll: 0,
    },
  });
}

// Fades atmosphere and fog by camera altitude for a cleaner look when zoomed in.
export function updateAtmosphereForZoom(viewer) {
  if (!viewer || viewer.isDestroyed()) {
    return;
  }

  const cameraHeight = viewer.camera.positionCartographic?.height ?? DEFAULT_CAMERA_HEIGHT_M;
  const fade = Cesium.Math.clamp(
    (cameraHeight - ATMOSPHERE_FADE_START_M) / ATMOSPHERE_FADE_RANGE_M,
    0,
    1,
  );

  viewer.scene.globe.atmosphereHueShift = 0.0;
  viewer.scene.globe.atmosphereSaturationShift = -1.0;
  viewer.scene.globe.atmosphereBrightnessShift = Cesium.Math.lerp(-0.18, -0.3, fade);

  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.hueShift = 0.0;
    viewer.scene.skyAtmosphere.saturationShift = -1.0;
    viewer.scene.skyAtmosphere.brightnessShift = Cesium.Math.lerp(-0.24, -0.38, fade);
  }

  viewer.scene.fog.enabled = true;
  viewer.scene.fog.density = Cesium.Math.lerp(0.00004, 0.000008, fade);
  viewer.scene.fog.minimumBrightness = Cesium.Math.lerp(0.16, 0.1, fade);
}
