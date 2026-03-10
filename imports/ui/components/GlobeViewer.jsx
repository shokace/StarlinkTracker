import { useEffect, useRef } from "react";
import * as Cesium from "cesium";

function toCartesian(position) {
  return Cesium.Cartesian3.fromDegrees(
    position.longitudeDeg,
    position.latitudeDeg,
    position.altitudeKm * 1000,
  );
}

export function GlobeViewer({
  satellites,
  positionsByNoradId,
  selectedNoradId,
  selectedOrbitPath,
  onSelectNoradId,
  loading,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const dataSourceRef = useRef(null);
  const pathEntityRef = useRef(null);
  const entityMapRef = useRef(new Map());

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
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = true;
    }
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#030710");
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 8000000;
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
    dataSourceRef.current = dataSource;
    viewerRef.current = viewer;

    const removeSelectionListener = viewer.selectedEntityChanged.addEventListener((entity) => {
      const noradId = entity?.properties?.noradId?.getValue?.();

      if (Number.isFinite(noradId)) {
        onSelectNoradId(noradId);
      }
    });

    return () => {
      removeSelectionListener();
      entityMapRef.current.clear();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [onSelectNoradId]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const dataSource = dataSourceRef.current;

    if (!viewer || !dataSource) {
      return;
    }

    const entityMap = entityMapRef.current;
    const visibleNoradIds = new Set(satellites.map((satellite) => satellite.noradId));

    for (const [noradId, entity] of entityMap.entries()) {
      if (!visibleNoradIds.has(noradId)) {
        dataSource.entities.remove(entity);
        entityMap.delete(noradId);
      }
    }

    satellites.forEach((satellite) => {
      const liveState = positionsByNoradId.get(satellite.noradId);

      if (!liveState) {
        return;
      }

      let entity = entityMap.get(satellite.noradId);

      if (!entity) {
        entity = dataSource.entities.add({
          id: String(satellite.noradId),
          name: satellite.name,
          properties: {
            noradId: satellite.noradId,
          },
          point: new Cesium.PointGraphics({
            pixelSize: 7,
            color: Cesium.Color.fromCssColorString("#4dd2ff"),
            outlineColor: Cesium.Color.fromCssColorString("#f7fbff"),
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          }),
        });

        entityMap.set(satellite.noradId, entity);
      }

      entity.position = toCartesian(liveState);
      entity.point.color = selectedNoradId === satellite.noradId
        ? Cesium.Color.fromCssColorString("#ffd166")
        : Cesium.Color.fromCssColorString("#4dd2ff");
      entity.point.pixelSize = selectedNoradId === satellite.noradId ? 11 : 7;
    });

    viewer.scene.requestRender();
  }, [satellites, positionsByNoradId, selectedNoradId]);

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
