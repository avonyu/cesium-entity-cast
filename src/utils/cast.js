import * as Cesium from 'cesium'
import { createTargetingCone } from './cesium/drawCone.js'
import * as turf from '@turf/turf'

// 1. 定义核心参数
const centerLon = 116.4; // 地面圆形区域中心经度
const centerLat = 39.9;  // 地面圆形区域中心纬度
const circleRadius = 15000; // 地面圆形区域半径(米)
const coneHeight = 50000; // 圆锥高度(米)
const coneBottomRadius = 3000; // 圆锥底部半径(米)
let scanPositions = []; // 存储轨迹边界点

export function createIntersectionPolygon(viewer, groundEntity, coneEntity, options = {}) {
  const {
    scanPositions = [],
    coneAngle = 22, // 使用圆锥角度代替固定半径
    groundCircleRadius = 10000,
  } = options;

  let lastFootprintPos = null;
  let accumulatedGeoJSON = null; // 累积的 GeoJSON 区域

  // 创建一个专门用于显示累积区域的实体
  const footprintEntity = viewer.entities.add({
    name: "FootprintTotal",
    polygon: {
      hierarchy: new Cesium.CallbackProperty(() => {
        // 如果有累积区域，将其转换为 Cesium Hierarchy 返回
        if (accumulatedGeoJSON) {
          // 处理 MultiPolygon 和 Polygon
          let positions = [];

          if (accumulatedGeoJSON.geometry.type === 'Polygon') {
            const coords = accumulatedGeoJSON.geometry.coordinates[0];
            positions = coords.map(c => Cesium.Cartesian3.fromDegrees(c[0], c[1]));
          } else if (accumulatedGeoJSON.geometry.type === 'MultiPolygon') {
            // 如果产生 MultiPolygon（分离区域），取面积最大的多边形以保证显示主体
            // 这是一个折衷方案，因为 Cesium 单个实体不支持 MultiPolygon
            let maxArea = -1;
            let maxCoords = null;

            const polygons = accumulatedGeoJSON.geometry.coordinates;
            polygons.forEach(polyCoords => {
              const polyFeature = turf.polygon(polyCoords);
              const area = turf.area(polyFeature);
              if (area > maxArea) {
                maxArea = area;
                maxCoords = polyCoords[0]; // 取外环
              }
            });

            if (maxCoords) {
              positions = maxCoords.map(c => Cesium.Cartesian3.fromDegrees(c[0], c[1]));
            }
          }

          return new Cesium.PolygonHierarchy(positions);
        }
        return new Cesium.PolygonHierarchy([]);
      }, false),
      material: Cesium.Color.YELLOW.withAlpha(0.6), // 调整为与高亮区域一致的透明度
      zIndex: 1, // 确保在地面圆之上
      classificationType: Cesium.ClassificationType.BOTH
    }
  });

  return viewer.entities.add({
    name: "Highlight",
    polygon: {
      hierarchy: new Cesium.CallbackProperty(() => {
        const time = viewer.clock.currentTime;
        const conePos = coneEntity.position.getValue(time);
        const groundPos = groundEntity.position.getValue(time);

        if (!conePos || !groundPos) {
          return new Cesium.PolygonHierarchy([]);
        }

        // 获取圆锥长度以计算顶点位置
        let coneLength = 20000;
        if (coneEntity.cylinder && coneEntity.cylinder.length) {
          const val = coneEntity.cylinder.length.getValue(time);
          if (val !== undefined) coneLength = val;
        }

        // 1. 计算圆锥主轴向量（从圆锥中心指向地面目标）
        const axis = Cesium.Cartesian3.subtract(groundPos, conePos, new Cesium.Cartesian3());
        Cesium.Cartesian3.normalize(axis, axis);

        // 修正：计算圆锥顶点 (Apex) 位置
        // 圆锥实体位置是几何中心，顶点位于中心沿反向主轴偏移 length/2 处
        const apexPos = new Cesium.Cartesian3();
        Cesium.Cartesian3.multiplyByScalar(axis, -coneLength / 2, apexPos);
        Cesium.Cartesian3.add(conePos, apexPos, apexPos);

        // 2. 构建局部坐标系 (tangent, bitangent, axis)
        const tangent = new Cesium.Cartesian3();
        const up = new Cesium.Cartesian3(0, 0, 1);

        // 如果 axis 接近垂直向上/向下，使用 X 轴作为参考
        if (Math.abs(Cesium.Cartesian3.dot(axis, up)) > 0.99) {
          Cesium.Cartesian3.cross(axis, new Cesium.Cartesian3(1, 0, 0), tangent);
        } else {
          Cesium.Cartesian3.cross(axis, up, tangent);
        }
        Cesium.Cartesian3.normalize(tangent, tangent);

        const bitangent = new Cesium.Cartesian3();
        Cesium.Cartesian3.cross(axis, tangent, bitangent);
        Cesium.Cartesian3.normalize(bitangent, bitangent);

        // 3. 射线与平面求交计算
        const intersectionPoints = [];
        const halfAngle = Cesium.Math.toRadians(coneAngle / 2);
        const tanHalfAngle = Math.tan(halfAngle);
        const ellipsoid = viewer.scene.globe.ellipsoid;

        for (let i = 0; i < 72; i++) { // 增加采样点以获得更平滑的椭圆
          const theta = Cesium.Math.toRadians(i * 5);

          // 构建射线方向：主轴方向 + 径向偏移
          const radial = new Cesium.Cartesian3();
          const tComponent = new Cesium.Cartesian3();
          const bComponent = new Cesium.Cartesian3();

          Cesium.Cartesian3.multiplyByScalar(tangent, Math.cos(theta), tComponent);
          Cesium.Cartesian3.multiplyByScalar(bitangent, Math.sin(theta), bComponent);
          Cesium.Cartesian3.add(tComponent, bComponent, radial);
          Cesium.Cartesian3.multiplyByScalar(radial, tanHalfAngle, radial);

          const rayDir = new Cesium.Cartesian3();
          Cesium.Cartesian3.add(axis, radial, rayDir);
          Cesium.Cartesian3.normalize(rayDir, rayDir);

          // 射线与椭球体求交，使用顶点 apexPos 作为起点
          const ray = new Cesium.Ray(apexPos, rayDir);
          const intersection = Cesium.IntersectionTests.rayEllipsoid(ray, ellipsoid);

          if (intersection) {
            const point = Cesium.Ray.getPoint(ray, intersection.start); // start 是距离

            // 判断点是否在地面圆形内 (沿地表距离)
            // 使用 Cartesian 距离作为近似，或者 Cartographic 距离
            const distance = Cesium.Cartesian3.distance(point, groundPos);
            if (distance <= groundCircleRadius) {
              intersectionPoints.push(point);
            }
          }
        }

        // 记录轨迹点（取交集多边形的中心点）
        if (intersectionPoints.length > 0) {
          // 简单的质心计算
          let sumLon = 0, sumLat = 0;
          intersectionPoints.forEach(p => {
            const c = Cesium.Cartographic.fromCartesian(p);
            sumLon += c.longitude;
            sumLat += c.latitude;
          });

          const center = Cesium.Cartesian3.fromRadians(
            sumLon / intersectionPoints.length,
            sumLat / intersectionPoints.length,
            0
          );

          // 更新累积区域（Footprint）
          // 只有当位置移动超过一定距离时才记录，避免过于密集
          if (!lastFootprintPos || Cesium.Cartesian3.distance(center, lastFootprintPos) > 100) {

            // 1. 将当前 intersectionPoints 转换为 GeoJSON Polygon
            // 注意：Turf 需要首尾闭合
            const coordinates = intersectionPoints.map(p => {
              const c = Cesium.Cartographic.fromCartesian(p);
              return [Cesium.Math.toDegrees(c.longitude), Cesium.Math.toDegrees(c.latitude)];
            });
            // 闭合
            if (coordinates.length > 0) {
              coordinates.push(coordinates[0]);

              const currentPoly = turf.polygon([coordinates]);

              // 2. 合并
              if (!accumulatedGeoJSON) {
                accumulatedGeoJSON = currentPoly;
              } else {
                try {
                  accumulatedGeoJSON = turf.union(turf.featureCollection([accumulatedGeoJSON, currentPoly]));
                  // 简化以提高性能
                  accumulatedGeoJSON = turf.simplify(accumulatedGeoJSON, { tolerance: 0.0001, highQuality: false });
                } catch (e) {
                  console.error("Turf union failed:", e);
                }
              }
            }

            lastFootprintPos = center;
          }

          scanPositions.push(center);
          // 限制轨迹长度
          if (scanPositions.length > 200) scanPositions.shift();
        }
        return new Cesium.PolygonHierarchy(intersectionPoints);
      }, false),
      material: Cesium.Color.YELLOW.withAlpha(0.6),
      zIndex: 2,
      classificationType: Cesium.ClassificationType.BOTH
    },
  });
}


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

  const coneEntity = createTargetingCone(viewer, {
    name: "Cone",
    position: positionProperty,
    targetPosition: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 0),
    length: coneHeight,
    coneAngle: 22,
    modelUrl: "/src/assets/models/uav.glb",
    color: Cesium.Color.RED.withAlpha(0.4)
  });

  // 4. 计算圆锥底面与地面圆形的交集，生成高亮区域
  const highlightPolygon = createIntersectionPolygon(viewer, groundCircle, coneEntity, {
    scanPositions: scanPositions,
    coneBottomRadius: coneBottomRadius,
    groundCircleRadius: circleRadius
  });

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
