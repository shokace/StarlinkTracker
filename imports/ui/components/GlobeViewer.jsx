import { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import {
  GLOBE_ANIMATION_FPS,
  LIVE_SAMPLE_REFRESH_INTERVAL_MS,
} from "/imports/api/satellites/constants";

function toCartesian(position, altitudeOffsetKm = 0) {
  return Cesium.Cartesian3.fromDegrees(
    position.longitudeDeg,
    position.latitudeDeg,
    (position.altitudeKm + altitudeOffsetKm) * 1000,
  );
}

export function GlobeViewer({
  satellites,
  positionsByNoradId,
  selectedNoradId,
  selectedDisplayState,
  selectedOrbitPath,
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
  const selectedCartesianRef = useRef(null);
  const selectedNoradIdRef = useRef(selectedNoradId);
  const onSelectNoradIdRef = useRef(onSelectNoradId);

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

    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#0b1b30");
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.scene.globe.translucency.enabled = false;
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = true;
    }
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#030710");
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 10000;
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(8, 18, 26000000),
    });

    void Cesium.TileMapServiceImageryProvider.fromUrl(
      Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"),
    ).then((imageryProvider) => {
      if (!viewer.isDestroyed()) {
        viewer.imageryLayers.addImageryProvider(imageryProvider);
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
          (frameTime - state.transitionStartMs) / LIVE_SAMPLE_REFRESH_INTERVAL_MS,
        );

        Cesium.Cartesian3.lerp(state.from, state.to, transitionProgress, state.current);
        point.position = state.current;
        didUpdate = true;

        if (selectedNoradIdRef.current === noradId) {
          selectedCartesianRef.current = state.current;
        }
      }

      if (didUpdate && !viewer.isDestroyed()) {
        viewer.scene.requestRender();
      }
    }, Math.round(1000 / GLOBE_ANIMATION_FPS));

    const handlePostRender = () => {
      updateSelectionMarker(viewer);
    };
    viewer.scene.postRender.addEventListener(handlePostRender);

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
      if (animationIntervalRef.current) {
        window.clearInterval(animationIntervalRef.current);
        animationIntervalRef.current = null;
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
          pixelSize: 3,
          color: Cesium.Color.fromCssColorString("#4dd2ff"),
          outlineColor: Cesium.Color.fromCssColorString("#f7fbff"),
          outlineWidth: 0.5,
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

      point.color = Cesium.Color.fromCssColorString("#4dd2ff");
      point.pixelSize = 3;
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

  return (
    <section className="globe-shell">
      <div ref={containerRef} className="globe-canvas" />
      <div ref={markerRef} className="globe-selection-marker" aria-hidden="true" />

      <div className="globe-overlay">
        <div className="globe-overlay__chip">
          {loading ? "Loading subscription…" : `${satellites.length} satellites on globe`}
        </div>
        <div className="globe-overlay__chip">
          Click a point to inspect live propagated position and orbital metadata.
        </div>
      </div>
    </section>
  );
}
