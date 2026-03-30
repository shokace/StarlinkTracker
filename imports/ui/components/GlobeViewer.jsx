import { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import {
  CLIENT_PROPAGATION_INTERVAL_MS,
  GLOBE_ANIMATION_FPS,
} from "/imports/api/satellites/constants";

function toCartesian(position, altitudeOffsetKm = 0) {
  return Cesium.Cartesian3.fromDegrees(
    position.longitudeDeg,
    position.latitudeDeg,
    (position.altitudeKm + altitudeOffsetKm) * 1000,
  );
}

function getApproximateUserCartesian(position, altitudeOffsetKm = 0) {
  return Cesium.Cartesian3.fromDegrees(
    position.longitudeDeg,
    position.latitudeDeg,
    altitudeOffsetKm * 1000,
  );
}

function isAboveUserHorizon(userCartesian, satelliteCartesian, minimumElevationDeg = 40) {
  const surfaceNormal = Cesium.Cartesian3.normalize(
    userCartesian,
    new Cesium.Cartesian3(),
  );
  const userToSatellite = Cesium.Cartesian3.subtract(
    satelliteCartesian,
    userCartesian,
    new Cesium.Cartesian3(),
  );
  const normalizedLineOfSight = Cesium.Cartesian3.normalize(
    userToSatellite,
    new Cesium.Cartesian3(),
  );
  const minimumDot = Math.sin(Cesium.Math.toRadians(minimumElevationDeg));

  return Cesium.Cartesian3.dot(normalizedLineOfSight, surfaceNormal) >= minimumDot;
}

function applyDefaultCameraView(viewer) {
  if (!viewer || viewer.isDestroyed()) {
    return;
  }

  viewer.camera.frustum.fov = Cesium.Math.toRadians(50);
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(8, 18, 12000000),
    orientation: {
      heading: 0,
      pitch: -Cesium.Math.PI_OVER_TWO,
      roll: 0,
    },
  });
}

function updateAtmosphereForZoom(viewer) {
  if (!viewer || viewer.isDestroyed()) {
    return;
  }

  const cameraHeight = viewer.camera.positionCartographic?.height ?? 12000000;
  const fade = Cesium.Math.clamp((cameraHeight - 9000000) / 18000000, 0, 1);

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

export function GlobeViewer({
  satellites,
  positionsByNoradId,
  selectedNoradId,
  selectedDisplayState,
  selectedOrbitPath,
  approximateUserLocation,
  locationStatus,
  locationErrorMessage,
  onRequestLocation,
  onSelectNoradId,
  loading,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const dataSourceRef = useRef(null);
  const pathEntityRef = useRef(null);
  const pointCollectionRef = useRef(null);
  const pointMapRef = useRef(new Map());
  const pointStateMapRef = useRef(new Map());
  const animationIntervalRef = useRef(null);
  const markerRef = useRef(null);
  const userVisibilityLineMapRef = useRef(new Map());
  const userCartesianRef = useRef(null);
  const selectedCartesianRef = useRef(null);
  const selectedNoradIdRef = useRef(selectedNoradId);
  const onSelectNoradIdRef = useRef(onSelectNoradId);
  const resizeObserverRef = useRef(null);

  function updateSelectionMarker(viewer) {
    const marker = markerRef.current;
    const selectedCartesian = selectedCartesianRef.current;

    if (!marker || !viewer || !selectedCartesian) {
      if (marker) {
        marker.style.display = "none";
      }
      return;
    }

    const occluder = new Cesium.EllipsoidalOccluder(
      Cesium.Ellipsoid.WGS84,
      viewer.camera.positionWC,
    );

    if (!occluder.isPointVisible(selectedCartesian)) {
      marker.style.display = "none";
      return;
    }

    const windowPosition = Cesium.SceneTransforms.worldToWindowCoordinates(
      viewer.scene,
      selectedCartesian,
    );

    if (!windowPosition) {
      marker.style.display = "none";
      return;
    }

    marker.style.display = "block";
    marker.style.transform = `translate(${windowPosition.x}px, ${windowPosition.y}px)`;
  }

  useEffect(() => {
    onSelectNoradIdRef.current = onSelectNoradId;
  }, [onSelectNoradId]);

  useEffect(() => {
    selectedNoradIdRef.current = selectedNoradId;
  }, [selectedNoradId]);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    Cesium.Ion.defaultAccessToken = undefined;

    const viewer = new Cesium.Viewer(containerRef.current, {
      animation: false,
      baseLayer: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      requestRenderMode: true,
      shadows: false,
    });

    viewer.scene.globe.enableLighting = false;
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#171a1f");
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.scene.globe.showGroundAtmosphere = true;
    viewer.scene.globe.translucency.enabled = false;
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = true;
    }
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#111214");
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 10000;
    applyDefaultCameraView(viewer);
    updateAtmosphereForZoom(viewer);

    void Cesium.TileMapServiceImageryProvider.fromUrl(
      Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"),
    ).then((imageryProvider) => {
      if (!viewer.isDestroyed()) {
        const imageryLayer = viewer.imageryLayers.addImageryProvider(imageryProvider);
        imageryLayer.alpha = 0.95;
        imageryLayer.brightness = 0.42;
        imageryLayer.contrast = 1.45;
        imageryLayer.gamma = 0.7;
        imageryLayer.saturation = 0.0;
        applyDefaultCameraView(viewer);
        updateAtmosphereForZoom(viewer);
        viewer.scene.requestRender();
      }
    });

    if (viewer.cesiumWidget?.creditContainer) {
      viewer.cesiumWidget.creditContainer.style.display = "none";
    }

    const dataSource = new Cesium.CustomDataSource("starlink-satellites");
    viewer.dataSources.add(dataSource);
    const pointCollection = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
    dataSourceRef.current = dataSource;
    pointCollectionRef.current = pointCollection;
    viewerRef.current = viewer;

    animationIntervalRef.current = window.setInterval(() => {
      const pointMap = pointMapRef.current;
      const pointStateMap = pointStateMapRef.current;
      const frameTime = Date.now();
      let didUpdate = false;

      for (const [noradId, state] of pointStateMap.entries()) {
        const point = pointMap.get(noradId);

        if (!point) {
          continue;
        }

        const transitionProgress = Math.min(
          1,
          (frameTime - state.transitionStartMs) / CLIENT_PROPAGATION_INTERVAL_MS,
        );

        Cesium.Cartesian3.lerp(state.from, state.to, transitionProgress, state.current);
        point.position = state.current;
        didUpdate = true;

        if (selectedNoradIdRef.current === noradId) {
          selectedCartesianRef.current = state.current;
        }
      }

      const userCartesian = userCartesianRef.current;

      if (userCartesian) {
        for (const [noradId, entity] of userVisibilityLineMapRef.current.entries()) {
          const pointState = pointStateMap.get(noradId);

          if (!pointState) {
            entity.show = false;
            continue;
          }

          entity.show = isAboveUserHorizon(userCartesian, pointState.current);
          didUpdate = true;
        }
      }

      if (didUpdate && !viewer.isDestroyed()) {
        viewer.scene.requestRender();
      }
    }, Math.round(1000 / GLOBE_ANIMATION_FPS));

    const handlePostRender = () => {
      updateAtmosphereForZoom(viewer);
      updateSelectionMarker(viewer);
    };
    viewer.scene.postRender.addEventListener(handlePostRender);

    if (typeof ResizeObserver !== "undefined") {
      resizeObserverRef.current = new ResizeObserver(() => {
        if (viewer.isDestroyed()) {
          return;
        }

        if (typeof viewer.forceResize === "function") {
          viewer.forceResize();
        } else if (typeof viewer.resize === "function") {
          viewer.resize();
        }

        viewer.scene.requestRender();
      });
      resizeObserverRef.current.observe(containerRef.current);
    }

    const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    clickHandler.setInputAction((movement) => {
      const picked = viewer.scene.pick(movement.position);
      const noradId = picked?.primitive?.id?.noradId;

      if (Number.isFinite(noradId)) {
        onSelectNoradIdRef.current?.(noradId);
      } else {
        onSelectNoradIdRef.current?.(null);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      clickHandler.destroy();
      viewer.scene.postRender.removeEventListener(handlePostRender);
      pointMapRef.current.clear();
      pointStateMapRef.current.clear();
      userVisibilityLineMapRef.current.clear();
      if (animationIntervalRef.current) {
        window.clearInterval(animationIntervalRef.current);
        animationIntervalRef.current = null;
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (!viewer.isDestroyed()) {
        viewer.destroy();
      }
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    const dataSource = dataSourceRef.current;

    if (!viewer || !dataSource) {
      return;
    }

    const pointCollection = pointCollectionRef.current;
    const pointMap = pointMapRef.current;
    const pointStateMap = pointStateMapRef.current;
    const updatedAtMs = Date.now();

    if (!pointCollection) {
      return;
    }

    const visibleNoradIds = new Set(satellites.map((satellite) => satellite.noradId));

    for (const [noradId, point] of pointMap.entries()) {
      if (!visibleNoradIds.has(noradId)) {
        pointCollection.remove(point);
        pointMap.delete(noradId);
        pointStateMap.delete(noradId);
      }
    }

    satellites.forEach((satellite) => {
      const liveState = positionsByNoradId.get(satellite.noradId);

      if (!liveState) {
        return;
      }

      let point = pointMap.get(satellite.noradId);

      if (!point) {
        const initialPosition = toCartesian(liveState);
        point = pointCollection.add({
          id: {
            noradId: satellite.noradId,
            name: satellite.name,
          },
          pixelSize: 1,
          color: Cesium.Color.fromCssColorString("#00a2ff"),
          outlineColor: Cesium.Color.fromCssColorString("#00a2ff"),
          outlineWidth: 0,
          position: initialPosition,
        });
        pointMap.set(satellite.noradId, point);
        pointStateMap.set(satellite.noradId, {
          current: Cesium.Cartesian3.clone(initialPosition),
          from: Cesium.Cartesian3.clone(initialPosition),
          to: Cesium.Cartesian3.clone(initialPosition),
          transitionStartMs: updatedAtMs,
        });
      }

      const targetPosition = toCartesian(liveState);
      const pointState = pointStateMap.get(satellite.noradId);

      if (!pointState) {
        point.position = targetPosition;
        pointStateMap.set(satellite.noradId, {
          current: Cesium.Cartesian3.clone(targetPosition),
          from: Cesium.Cartesian3.clone(targetPosition),
          to: Cesium.Cartesian3.clone(targetPosition),
          transitionStartMs: updatedAtMs,
        });
      } else {
        Cesium.Cartesian3.clone(pointState.current, pointState.from);
        Cesium.Cartesian3.clone(targetPosition, pointState.to);
        pointState.transitionStartMs = updatedAtMs;
      }

      point.color = Cesium.Color.fromCssColorString("#00a2ff");
      point.pixelSize = 1;
    });

    viewer.scene.requestRender();
  }, [satellites, positionsByNoradId]);

  useEffect(() => {
    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    if (selectedNoradId && selectedDisplayState) {
      selectedCartesianRef.current =
        pointStateMapRef.current.get(selectedNoradId)?.current || toCartesian(selectedDisplayState);
    } else {
      selectedCartesianRef.current = null;
    }

    updateSelectionMarker(viewer);
    viewer.scene.requestRender();
  }, [selectedNoradId, selectedDisplayState]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const dataSource = dataSourceRef.current;

    if (!viewer || !dataSource) {
      return;
    }

    if (pathEntityRef.current) {
      dataSource.entities.remove(pathEntityRef.current);
      pathEntityRef.current = null;
    }

    if (selectedOrbitPath?.length) {
      pathEntityRef.current = dataSource.entities.add({
        polyline: {
          positions: selectedOrbitPath.map(toCartesian),
          width: 2,
          material: new Cesium.PolylineGlowMaterialProperty({
            color: Cesium.Color.fromCssColorString("#ffd166"),
            glowPower: 0.22,
          }),
        },
      });
    }

    viewer.scene.requestRender();
  }, [selectedOrbitPath]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const dataSource = dataSourceRef.current;

    if (!viewer || !dataSource) {
      return;
    }

    if (!approximateUserLocation) {
      userCartesianRef.current = null;
      viewer.scene.requestRender();
      return;
    }

    userCartesianRef.current = getApproximateUserCartesian(approximateUserLocation, 0);
    viewer.scene.requestRender();
  }, [approximateUserLocation]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const dataSource = dataSourceRef.current;
    const lineMap = userVisibilityLineMapRef.current;

    if (!viewer || !dataSource) {
      return;
    }

    if (!approximateUserLocation) {
      for (const entity of lineMap.values()) {
        dataSource.entities.remove(entity);
      }
      lineMap.clear();
      viewer.scene.requestRender();
      return;
    }

    const userCartesian = userCartesianRef.current || getApproximateUserCartesian(approximateUserLocation);
    const visibleNoradIds = new Set();

    satellites.forEach((satellite) => {
      const liveState = positionsByNoradId.get(satellite.noradId);

      if (!liveState) {
        return;
      }

      const satelliteCartesian = toCartesian(liveState);

      if (!isAboveUserHorizon(userCartesian, satelliteCartesian)) {
        return;
      }

      visibleNoradIds.add(satellite.noradId);
      const positions = [userCartesian, satelliteCartesian];
      let entity = lineMap.get(satellite.noradId);

      if (!entity) {
        entity = dataSource.entities.add({
          id: `user-visibility-line-${satellite.noradId}`,
          polyline: {
            positions: new Cesium.CallbackProperty(() => {
              const latestUserCartesian = userCartesianRef.current;
              const pointState = pointStateMapRef.current.get(satellite.noradId);

              if (!latestUserCartesian || !pointState) {
                return [userCartesian, satelliteCartesian];
              }

              return [latestUserCartesian, pointState.current];
            }, false),
            width: 1.5,
            material: Cesium.Color.fromCssColorString("#ffffff").withAlpha(0.72),
          },
        });
        lineMap.set(satellite.noradId, entity);
      }

      entity.show = true;
    });

    for (const [noradId, entity] of lineMap.entries()) {
      if (!visibleNoradIds.has(noradId)) {
        dataSource.entities.remove(entity);
        lineMap.delete(noradId);
      }
    }

    viewer.scene.requestRender();
  }, [approximateUserLocation, positionsByNoradId, satellites]);

  return (
    <section className="globe-shell">
      <div ref={containerRef} className="globe-canvas" />
      <div ref={markerRef} className="globe-selection-marker" aria-hidden="true" />

      <div className="globe-overlay">
        <div className="globe-overlay__chip">
          {loading ? "Loading subscription…" : `${satellites.length} satellites on globe`}
        </div>
      </div>

      {(locationStatus === "prompt" ||
        locationStatus === "requesting" ||
        locationStatus === "denied" ||
        locationStatus === "unsupported") && (
        <div className="location-prompt">
          <div>
            <p className="location-prompt__title">Show your approximate location</p>
            <p className="location-prompt__body">
              Allow coarse browser geolocation and we will round it to your general area before
              placing a green marker on the globe.
            </p>
            {locationErrorMessage && (
              <p className="location-prompt__error">{locationErrorMessage}</p>
            )}
          </div>

          <button
            className="location-prompt__button"
            onClick={onRequestLocation}
            disabled={locationStatus === "requesting" || locationStatus === "unsupported"}
          >
            {locationStatus === "requesting"
              ? "Requesting..."
              : locationStatus === "denied"
                ? "Try again"
                : locationStatus === "unsupported"
                  ? "Unavailable"
                  : "Allow approximate location"}
          </button>
        </div>
      )}
    </section>
  );
}
