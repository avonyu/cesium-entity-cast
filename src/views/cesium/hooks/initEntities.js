import * as Cesium from 'cesium'
import { createTargetingCone, createGroundCircle } from '@/lib/cesium/cesiumDraw.js'
import { createIntersectionPolygon } from '@/lib/cesium/utils.js';

// 1. 定义核心参数
const centerLon = 116.4; // 地面圆形区域中心经度
const centerLat = 39.9;  // 地面圆形区域中心纬度
const circleRadius = 30000; // 地面圆形区域半径(米)
const coneHeight = 100000; // 圆锥高度(米)
const coneAngle = 22; // 圆锥角度(度)
let scanPositions = []; // 存储轨迹边界点

let targetPosition = Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 0);

export function castToCartesian3(viewer, enableAnimation = false) {
  // 2. 创建地面圆形区域
  const groundCircle = createGroundCircle(viewer, {
    longitude: centerLon,
    latitude: centerLat,
    radius: circleRadius,
    color: Cesium.Color.BLUE.withAlpha(0.2),
    outlineColor: Cesium.Color.BLUE,
  });

  // 3. 创建可移动的圆锥实体
  const startTime = Cesium.JulianDate.now();

  // 生成5个圆锥，并在不同位置和方向移动
  const coneEntities = [];
  const colors = [Cesium.Color.RED, Cesium.Color.BLUE, Cesium.Color.GREEN, Cesium.Color.YELLOW, Cesium.Color.PURPLE];

  for (let i = 0; i < 5; i++) {
    // 偏移起始位置，让它们散开
    const offsetLon = (i - 2) * 0.1;
    const offsetLat = (i % 2 === 0 ? 0.1 : -0.1) * (i + 1) * 0.5;

    // 生成不同的动画路径
    const positionProperty = setupConeAnimation(
      centerLon + offsetLon,
      centerLat + offsetLat,
      enableAnimation,
      startTime,
      i // 传入索引以产生差异化路径
    );

    const coneEntity = createTargetingCone(viewer, {
      name: `Cone${i + 1}`,
      position: positionProperty,
      orientation: Cesium.Quaternion.IDENTITY,
      targetPosition: targetPosition || null,
      length: coneHeight,
      coneAngle: coneAngle,
      color: colors[i % colors.length].withAlpha(0.4)
    });

    coneEntities.push(coneEntity);
  }

  // 设置时钟范围以播放动画
  if (enableAnimation) {
    const stopTime = Cesium.JulianDate.addSeconds(startTime, 9, new Cesium.JulianDate()); // 假设 waypoints 长度为 10
    viewer.clock.startTime = startTime.clone();
    viewer.clock.stopTime = stopTime.clone();
    viewer.clock.currentTime = startTime.clone();
    viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
    viewer.clock.multiplier = 1;
    viewer.clock.shouldAnimate = true;
  }

  // 4. 计算圆锥底面与地面圆形的交集，生成高亮区域
  if (targetPosition) {
    createIntersectionPolygon(viewer, groundCircle, coneEntities, {
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
 * @param {number} centerLon 中心经度
 * @param {number} centerLat 中心纬度
 * @param {boolean} enable 是否启用动画
 * @param {Cesium.JulianDate} startTime 动画开始时间
 * @param {number} index 索引，用于生成差异化路径
 * @returns {Cesium.Property} 位置属性
 */
function setupConeAnimation(centerLon, centerLat, enable, startTime, index = 0) {
  const height = 20000;

  // 如果不启用动画，返回起始位置的固定坐标
  if (!enable) {
    return Cesium.Cartesian3.fromDegrees(centerLon - 0.05, centerLat - 0.05, height);
  }

  // 基础偏移量，根据索引调整方向
  const dirX = (index % 2 === 0) ? 1 : -1;
  const dirY = (index % 3 === 0) ? 1 : -1;

  // 定义移动路径坐标列表（每隔一秒变换位置）
  const waypoints = [
    { lon: centerLon, lat: centerLat, height: height },
    { lon: centerLon + 0.02 * dirX, lat: centerLat + 0.02 * dirY, height: height },
    { lon: centerLon + 0.04 * dirX, lat: centerLat + 0.04 * dirY, height: height },
    { lon: centerLon + 0.06 * dirX, lat: centerLat - 0.02 * dirY, height: height },
    { lon: centerLon + 0.04 * dirX, lat: centerLat - 0.04 * dirY, height: height },
    { lon: centerLon + 0.02 * dirX, lat: centerLat - 0.06 * dirY, height: height },
    { lon: centerLon, lat: centerLat - 0.04 * dirY, height: height },
    { lon: centerLon - 0.02 * dirX, lat: centerLat - 0.02 * dirY, height: height },
    { lon: centerLon - 0.04 * dirX, lat: centerLat, height: height },
    { lon: centerLon, lat: centerLat, height: height },
  ];

  const positionProperty = new Cesium.SampledPositionProperty();

  waypoints.forEach((p, i) => {
    const time = Cesium.JulianDate.addSeconds(startTime, i, new Cesium.JulianDate());
    const position = Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.height);
    positionProperty.addSample(time, position);
  });

  return positionProperty;
}
