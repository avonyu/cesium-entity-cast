import * as Cesium from "cesium";
import { createCone, createGroundCircle } from "@/lib/cesium/cesiumDraw.js";
import { createIntersectionPolygon } from "@/lib/cesium/utils.js";
import positionData from "@/positions/position.json";

// 1. 定义核心参数
const centerLon = 116.4; // 地面圆形区域中心经度
const centerLat = 39.9; // 地面圆形区域中心纬度
const circleRadius = 30000; // 地面圆形区域半径(米)
const coneHeight = 20000; // 圆锥高度(米)
const coneAngle = 22; // 圆锥角度(度)
let scanPositions = []; // 存储轨迹边界点

let targetPosition = Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 0);

/**
 * 初始化场景实体
 * 场景要求如下：
 * 1. 初始化一个地面圆形区域和一个圆锥实体，圆锥实体的pitch角度为45度
 * 2. 读取positionData中的实时位置数据,模拟使用websocket实时接收位置数据
 * 3. 使用viewer.entities.getById('coneEntity')获取圆锥实体的方式更新实体的位置
 * 4. 为保证更新的平滑,使用Cesium.SampledPositionProperty和Cesium.SampledProperty来更新位置和朝向
 * 5. 前25个点,isTargetOrientation为false，圆锥实体在地面圆形区域上方平移,使用VelocityOrientationProperty来更新朝向
 * 6. 后25个点，isTargetOrientation为true，orientation指向targetPosition,开始传入targetPosition值
 * 7. 全过程中，使用createIntersectionPolygon函数记录圆锥实体与地面圆形区域的交点，作为轨迹边界点
 * @param {Cesium.Viewer} viewer
 */
export function scene(viewer) {
  // 设置时间系统
  const startData = positionData[0];
  const startTime = Cesium.JulianDate.fromIso8601(startData.time);
  const stopTime = Cesium.JulianDate.fromIso8601(
    positionData[positionData.length - 1].time,
  );

  viewer.clock.startTime = startTime.clone();
  viewer.clock.stopTime = stopTime.clone();
  viewer.clock.currentTime = startTime.clone();
  viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
  viewer.clock.multiplier = 1;
  viewer.clock.shouldAnimate = true;

  // 1. 初始化地面圆形区域
  const groundEntity = createGroundCircle(viewer, {
    id: "groundCircle",
    longitude: centerLon,
    latitude: centerLat,
    radius: circleRadius,
  });

  // 4. 创建SampledProperty用于平滑更新
  const positionProperty = new Cesium.SampledPositionProperty();
  positionProperty.forwardExtrapolationType = Cesium.ExtrapolationType.HOLD;

  // 补充：初始化前两个点的数据，确保VelocityOrientationProperty有足够的数据计算初始朝向
  for (let i = 0; i < 2; i++) {
    const data = positionData[i];
    const time = Cesium.JulianDate.fromIso8601(data.time);
    const position = Cesium.Cartesian3.fromDegrees(
      data.position[0],
      data.position[1],
      data.position[2],
    );
    positionProperty.addSample(time, position);
  }

  // 使用VelocityOrientationProperty根据位置变化自动计算朝向
  const orientationProperty = new Cesium.VelocityOrientationProperty(
    positionProperty,
  );

  // const orientation = Cesium.Transforms.headingPitchRollQuaternion(
  //   new Cesium.Cartesian3(centerLon, centerLat, coneHeight),
  //   new Cesium.HeadingPitchRoll(
  //     Cesium.Math.toRadians(0),
  //     Cesium.Math.toRadians(0),
  //     Cesium.Math.toRadians(0),
  //   ),
  // );

  // 初始化圆锥实体
  // 1. 初始化一个地面圆形区域和一个圆锥实体，圆锥实体的pitch角度为45度
  const coneEntity = createCone(viewer, {
    id: "coneEntity",
    position: positionProperty,
    orientation: orientationProperty,
    length: coneHeight,
    coneAngle: Cesium.Math.toRadians(coneAngle),
    targetPosition: targetPosition,
    isTargetOrientation: false,
  });

  // 7. 使用createIntersectionPolygon函数记录交点
  createIntersectionPolygon(viewer, groundEntity, coneEntity, {
    scanPositions: scanPositions,
    coneAngle: coneAngle,
    groundCircleRadius: circleRadius,
  });

  // 2. 模拟使用websocket实时接收位置数据
  let index = 2; // 从第3个点开始，因为前两个已经添加
  const interval = setInterval(() => {
    if (index >= positionData.length) {
      clearInterval(interval);
      return;
    }

    const data = positionData[index];
    const time = Cesium.JulianDate.fromIso8601(data.time);
    const position = Cesium.Cartesian3.fromDegrees(
      data.position[0],
      data.position[1],
      data.position[2],
    );

    // 3. 使用viewer.entities.getById('coneEntity')获取圆锥实体
    const entity = viewer.entities.getById("coneEntity");
    if (entity) {
      // 4. 更新位置 (SampledPositionProperty)
      // 注意：entity.position 就是我们传入的 positionProperty
      entity.position.addSample(time, position);

      // 5. 前25个点
      if (index < 25) {
        entity.isTargetOrientation = false;
        // 使用VelocityOrientationProperty自动更新，无需手动设置
      }
      // 6. 后25个点
      else {
        entity.isTargetOrientation = true;
        // 此时不需要手动更新 orientationProperty，createCone 内部会自动计算
      }
    }

    index++;
  }, 1000); // 假设每秒接收一次数据

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(
      centerLon,
      centerLat,
      circleRadius + coneHeight,
    ),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-45),
      roll: Cesium.Math.toRadians(0),
    },
  });
}
