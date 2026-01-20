import * as Cesium from 'cesium'

export function cesiumInit(cesiumRef) {
  // 配置 Cesium Ion 访问令牌
  Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN;
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

  // 开启深度测试，确保模型在地形上
  viewer.scene.globe.depthTestAgainstTerrain = true;

  return viewer;
}