import * as Cesium from 'cesium'
import * as turf from '@turf/turf'

/**
 * 创建圆锥与地面圆形区域的交集多边形
 * @param {Viewer} viewer - Cesium 查看器实例
 * @param {Entity} groundEntity - 地面圆形区域实体
 * @param {Entity} coneEntity - 可移动的圆锥实体
 * @param {Object} options - 配置选项
 * @param {Array} options.scanPositions - 扫描轨迹边界点数组
 * @param {Number} options.coneAngle - 圆锥角度(度)
 * @param {Number} options.groundCircleRadius - 地面圆形区域半径(米)
 */
export function createIntersectionPolygon(viewer, groundEntity, coneEntitiesInput, options = {}) {
  // 确保输入为数组
  const coneEntities = Array.isArray(coneEntitiesInput) ? coneEntitiesInput : [coneEntitiesInput];

  const {
    scanPositions = [],
    coneAngle = 22, // 使用圆锥角度代替固定半径
    groundCircleRadius = 10000,
    showFootprint = true,
    showHighlight = false,
  } = options;

  let accumulatedGeoJSON = null; // 累积的 GeoJSON 区域 (所有圆锥共享)

  // 创建一个专门用于显示累积区域的实体
  const footprintEntity = viewer.entities.add({
    name: "FootprintTotal",
    show: showFootprint,
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
      material: Cesium.Color.YELLOW.withAlpha(0.5), // 调整为与高亮区域一致的透明度
      zIndex: 1, // 确保在地面圆之上
      classificationType: Cesium.ClassificationType.BOTH
    }
  });

  // 为每个圆锥实体创建对应的 Highlight 实体
  const highlightEntities = coneEntities.map(coneEntity => {
    // 每个圆锥维护自己的 lastFootprintPos，避免相互干扰更新逻辑
    let lastFootprintPos = null;

    return viewer.entities.add({
      name: "Highlight",
      show: showHighlight,
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
        material: Cesium.Color.YELLOW.withAlpha(0.5),
        zIndex: 2,
        classificationType: Cesium.ClassificationType.BOTH
      },
    });
  });

  return {
    highlightEntities, // 返回数组
    footprintEntity,
  }
}