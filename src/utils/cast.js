import * as Cesium from 'cesium'

// 1. 定义核心参数
const centerLon = 116.4; // 地面圆形区域中心经度
const centerLat = 39.9;  // 地面圆形区域中心纬度
const circleRadius = 5000; // 地面圆形区域半径(米)
const coneHeight = 3000; // 圆锥高度(米)
const coneBottomRadius = 3000; // 圆锥底部半径(米)
let scanPositions = []; // 存储轨迹边界点

export function castToCartesian3(viewer) {
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
  const coneEntity = viewer.entities.add({
    name: "Cone",
    position: new Cesium.CallbackProperty(() => {
      // 圆锥随时间绕地面圆心旋转
      const time = viewer.clock.currentTime.secondsOfDay;
      const angle = Cesium.Math.toRadians(time * 0.1);
      const offset = Cesium.Cartesian3.fromDegrees(
        centerLon + Math.cos(angle) * 0.02,
        centerLat + Math.sin(angle) * 0.02,
        coneHeight
      );
      return offset;
    }, false),
    cylinder: {
      length: coneHeight,
      topRadius: 0, // 顶部半径为0 即为圆锥
      bottomRadius: coneBottomRadius,
      material: Cesium.Color.RED.withAlpha(0.4),
      outline: true,
      outlineColor: Cesium.Color.RED,
    },
  });

  // 4. 计算圆锥底面与地面圆形的交集，生成高亮区域
  const highlightPolygon = viewer.entities.add({
    name: "Highlight",
    polygon: {
      hierarchy: new Cesium.CallbackProperty(() => {
        const conePos = coneEntity.position.getValue(viewer.clock.currentTime);
        // 圆锥底面中心点（投影到地面）
        const coneBottomCenter = Cesium.Cartographic.fromCartesian(conePos);
        coneBottomCenter.height = 0;
        const coneBottomCartesian = Cesium.Cartesian3.fromRadians(
          coneBottomCenter.longitude,
          coneBottomCenter.latitude,
          0
        );

        // 简化版交集计算：取圆锥底面圆与地面圆的重叠多边形（完整需空间几何库辅助）
        const intersectionPoints = [];
        // 模拟生成交集边界点（实际项目需引入 turf.js 等做几何运算）
        for (let i = 0; i < 36; i++) {
          const angle = Cesium.Math.toRadians(i * 10);
          const point = Cesium.Cartesian3.fromDegrees(
            coneBottomCenter.longitude / Math.PI * 180 + Math.cos(angle) * coneBottomRadius / 111319,
            coneBottomCenter.latitude / Math.PI * 180 + Math.sin(angle) * coneBottomRadius / 111319,
            0
          );
          // 判断点是否在地面圆形内
          const distance = Cesium.Cartesian3.distance(point, groundCircle.position.getValue(viewer.clock.currentTime));
          if (distance <= circleRadius) {
            intersectionPoints.push(point);
          }
        }
        // 记录轨迹点（取交集多边形的中心点）
        if (intersectionPoints.length > 0) {
          const center = Cesium.Cartesian3.fromDegrees(
            (intersectionPoints.reduce((sum, p) => sum + Cesium.Cartographic.fromCartesian(p).longitude, 0) / intersectionPoints.length) / Math.PI * 180,
            (intersectionPoints.reduce((sum, p) => sum + Cesium.Cartographic.fromCartesian(p).latitude, 0) / intersectionPoints.length) / Math.PI * 180,
            0
          );
          scanPositions.push(center);
          // 限制轨迹长度
          if (scanPositions.length > 200) scanPositions.shift();
        }
        return new Cesium.PolygonHierarchy(intersectionPoints);
      }, false),
      material: Cesium.Color.YELLOW.withAlpha(0.6),
    },
  });

  // 5. 创建扫过的轨迹线
  const scanTrajectory = viewer.entities.add({
    name: "Trajectory",
    polyline: {
      positions: new Cesium.CallbackProperty(() => scanPositions, false),
      width: 5,
      material: Cesium.Color.YELLOW,
    },
  });

  // 6. 视角聚焦
  viewer.zoomTo(groundCircle);
}