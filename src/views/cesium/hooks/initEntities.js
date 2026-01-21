import * as Cesium from 'cesium'
import { createTargetingCone } from '@/lib/cesium/drawCone.js'
import { createIntersectionPolygon } from '@/lib/cesium/utils.js';

// 1. 定义核心参数
const centerLon = 116.4; // 地面圆形区域中心经度
const centerLat = 39.9;  // 地面圆形区域中心纬度
const circleRadius = 15000; // 地面圆形区域半径(米)
const coneHeight = 50000; // 圆锥高度(米)
const coneAngle = 22; // 圆锥角度(度)
let scanPositions = []; // 存储轨迹边界点

let targetPosition = Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 0);

export function castToCartesian3(viewer, enableAnimation = false) {
  // 2. 创建地面圆形区域
  const groundCircle = viewer.entities.add({
    name: "GroundCircle",
    position: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 0),
    ellipse: {
      semiMajorAxis: circleRadius,
      semiMinorAxis: circleRadius,
      material: Cesium.Color.BLUE.withAlpha(0.2),
      outline: true,
      outlineColor: Cesium.Color.BLUE,
    },
  });

  // 3. 创建可移动的圆锥实体
  const positionProperty = setupConeAnimation(viewer, centerLon, centerLat, enableAnimation);

  // targetPosition = null;

  const coneEntity = createTargetingCone(viewer, {
    name: "Cone",
    position: positionProperty,
    targetPosition: targetPosition || null,
    orientation: Cesium.Quaternion.IDENTITY,
    length: coneHeight,
    coneAngle: coneAngle,
    modelUrl: "/src/assets/models/uav.glb",
    color: Cesium.Color.RED.withAlpha(0.4)
  });

  // 4. 计算圆锥底面与地面圆形的交集，生成高亮区域
  if (targetPosition) {
    createIntersectionPolygon(viewer, groundCircle, coneEntity, {
      scanPositions: scanPositions,
      coneAngle: coneAngle,
      groundCircleRadius: circleRadius
    });
  }

  // 6. 视角聚焦
  viewer.zoomTo(groundCircle);
}

/**
 * 配置圆锥动画
 * @param {Cesium.Viewer} viewer 
 * @param {number} centerLon 中心经度
 * @param {number} centerLat 中心纬度
 * @param {boolean} enable 是否启用动画
 * @returns {Cesium.Property} 位置属性
 */
function setupConeAnimation(viewer, centerLon, centerLat, enable) {
  const height = 4000;

  // 如果不启用动画，返回起始位置的固定坐标
  if (!enable) {
    return Cesium.Cartesian3.fromDegrees(centerLon - 0.05, centerLat - 0.05, height);
  }

  // 定义移动路径坐标列表（每隔一秒变换位置）
  const waypoints = [
    { lon: centerLon - 0.05, lat: centerLat - 0.05, height: height },
    { lon: centerLon - 0.03, lat: centerLat - 0.03, height: height },
    { lon: centerLon - 0.01, lat: centerLat - 0.01, height: height },
    { lon: centerLon + 0.01, lat: centerLat + 0.01, height: height },
    { lon: centerLon + 0.03, lat: centerLat + 0.03, height: height },
    { lon: centerLon + 0.05, lat: centerLat + 0.05, height: height },
    { lon: centerLon + 0.05, lat: centerLat + 0.02, height: height },
    { lon: centerLon + 0.03, lat: centerLat, height: height },
    { lon: centerLon + 0.01, lat: centerLat - 0.02, height: height },
    { lon: centerLon - 0.02, lat: centerLat - 0.04, height: height },
  ];

  const positionProperty = new Cesium.SampledPositionProperty();
  const startTime = Cesium.JulianDate.now();

  waypoints.forEach((p, i) => {
    const time = Cesium.JulianDate.addSeconds(startTime, i, new Cesium.JulianDate());
    const position = Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.height);
    positionProperty.addSample(time, position);
  });

  // 设置时钟范围以播放动画
  const stopTime = Cesium.JulianDate.addSeconds(startTime, waypoints.length - 1, new Cesium.JulianDate());
  viewer.clock.startTime = startTime.clone();
  viewer.clock.stopTime = stopTime.clone();
  viewer.clock.currentTime = startTime.clone();
  viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
  viewer.clock.multiplier = 1;
  viewer.clock.shouldAnimate = true;

  return positionProperty;
}
