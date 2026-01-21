import * as Cesium from 'cesium'

/**
 * 初始化 Cesium 查看器
 * @param {HTMLElement} cesiumRef - Cesium 容器 DOM 元素
 * @returns {Cesium.Viewer} - Cesium 查看器实例
 */
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