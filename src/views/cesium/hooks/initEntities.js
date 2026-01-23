import * as Cesium from 'cesium'
import { createCone, createGroundCircle } from '@/lib/cesium/cesiumDraw.js'
import { createIntersectionPolygon } from '@/lib/cesium/utils.js';
import positionData from '/public/positions/position.json'

// 1. 定义核心参数
const centerLon = 116.4; // 地面圆形区域中心经度
const centerLat = 39.9;  // 地面圆形区域中心纬度
const circleRadius = 30000; // 地面圆形区域半径(米)
const coneHeight = 20000; // 圆锥高度(米)
const coneAngle = 22; // 圆锥角度(度)
let scanPositions = []; // 存储轨迹边界点

let targetPosition = Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 0);

/**
 * 初始化场景实体
 * 场景要求如下：
 * 1. 初始化一个地面圆形区域和一个圆锥实体，圆锥实体的pitch角度为45度
 * 2. 读取positionData中的位置数据,每隔500ms更新一个点为圆锥实体的位置
 * 3. 使用viewer.entities.getById('coneEntity')获取圆锥实体的方式更新实体的位置
 * 4. 为保证更新的平滑,使用Cesium.SampledPositionProperty和Cesium.SampledProperty来更新位置和朝向
 * 5. 前25个点,isTargetOrientation为false，圆锥实体在地面圆形区域上方平移,不提前传入targetPosition值
 * 6. 后25个点，isTargetOrientation为true，orientation指向targetPosition,开始传入targetPosition值
 * 7. 全过程中，使用createIntersectionPolygon函数记录圆锥实体与地面圆形区域的交点，作为轨迹边界点
 * @param {Cesium.Viewer} viewer 
 */
export function scene(viewer) {
  // 0. 设置时间轴
  const start = Cesium.JulianDate.fromIso8601(positionData[0].time);
  const stop = Cesium.JulianDate.fromIso8601(positionData[positionData.length - 1].time);

  viewer.clock.startTime = start.clone();
  viewer.clock.stopTime = stop.clone();
  viewer.clock.currentTime = start.clone();
  viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
  viewer.clock.multiplier = 1;
  viewer.clock.shouldAnimate = true;

  // 1. 初始化地面圆形区域
  const groundEntity = createGroundCircle(viewer, {
    id: 'groundCircle',
    longitude: centerLon,
    latitude: centerLat,
    radius: circleRadius
  });

  // 2. 初始化圆锥实体
  const positionProperty = new Cesium.SampledPositionProperty();
  positionProperty.forwardExtrapolationType = Cesium.ExtrapolationType.HOLD;

  const orientationProperty = new Cesium.SampledProperty(Cesium.Quaternion);
  orientationProperty.forwardExtrapolationType = Cesium.ExtrapolationType.HOLD;

  const coneEntity = createCone(viewer, {
    id: 'coneEntity',
    position: positionProperty,
    orientation: orientationProperty,
    coneAngle: Cesium.Math.toRadians(coneAngle), // 转换为弧度
    length: coneHeight,
    isTargetOrientation: false,
    targetPosition: null
  });

  // 3. 开启交集计算
  // createIntersectionPolygon(viewer, groundEntity, coneEntity, {
  //   scanPositions: scanPositions,
  //   coneAngle: coneAngle,
  //   groundCircleRadius: circleRadius
  // });

  // 预先添加第一个点，避免初始时刻无数据导致的渲染问题
  if (positionData.length > 0) {
    const item = positionData[0];
    const time = Cesium.JulianDate.fromIso8601(item.time);
    const position = Cesium.Cartesian3.fromDegrees(item.position[0], item.position[1], item.position[2]);
    positionProperty.addSample(time, position);

    const hpRoll = new Cesium.HeadingPitchRoll(0, Cesium.Math.toRadians(-45), 0);
    const orientation = Cesium.Transforms.headingPitchRollQuaternion(position, hpRoll);
    orientationProperty.addSample(time, orientation);
  }

  // 4. 数据更新循环
  let index = 1;
  const timer = setInterval(() => {
    if (index >= positionData.length) {
      clearInterval(timer);
      return;
    }

    const item = positionData[index];
    const time = Cesium.JulianDate.fromIso8601(item.time);
    const position = Cesium.Cartesian3.fromDegrees(item.position[0], item.position[1], item.position[2]);

    // 获取实体 (Requirements 3)
    const entity = viewer.entities.getById('coneEntity');
    if (entity) {
      // 更新位置 (Requirements 4: SampledPositionProperty)
      // entity.position 已经是 SampledPositionProperty
      entity.position.addSample(time, position);

      // 计算并更新朝向 (Pitch 45度)
      // Pitch -45度 (向下倾斜)
      const hpRoll = new Cesium.HeadingPitchRoll(0, Cesium.Math.toRadians(-45), 0);
      const orientation = Cesium.Transforms.headingPitchRollQuaternion(position, hpRoll);

      // 更新 orientation SampledProperty
      orientationProperty.addSample(time, orientation);

      // 控制 targetOrientation (Requirements 5 & 6)
      if (index < 25) {
        // 前25个点
        entity.isTargetOrientation = false;
        entity.targetPosition = null;
      } else {
        // 后25个点
        entity.isTargetOrientation = true;
        entity.targetPosition = targetPosition;
      }
    }

    index++;
  }, 500);
  viewer.flyTo(groundEntity);
}