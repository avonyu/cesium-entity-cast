import * as Cesium from 'cesium'

export function cesiumInit(cesiumRef) {
  const viewer = new Cesium.Viewer(cesiumRef, {
    selectionIndicator: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    selectionIndicator: false,
    infoBox: false,
  });
  viewer.scene.globe.depthTestAgainstTerrain = true;

  return viewer;
}