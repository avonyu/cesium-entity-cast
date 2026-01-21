import * as Cesium from 'cesium'

/**
 * 创建一个指向地面上目标点的圆锥模型
 * @param {Cesium.Viewer} viewer 
 * @param {Object} options 
 * @param {Cesium.Cartesian3} options.position 圆锥顶点位置 (尖端)
 * @param {Number} options.length 圆锥长度
 * @param {Number} options.coneAngle 圆锥角度（弧度）
 * @param {Cesium.Quaternion} options.orientation 圆锥方向四元数
 * @param {Cesium.Cartesian3} options.targetPosition 地面上的目标点
 * @param {Cesium.Color} options.color 圆锥颜色
 * @param {String} options.name 圆锥名称
 * @returns {Cesium.Entity} 圆锥实体
 */
export function createTargetingCone(viewer, options) {
  const {
    position,
    length = 3000,
    coneAngle,
    orientation,
    targetPosition = null, // 新增参数：地面上的目标点
    color = Cesium.Color.RED.withAlpha(0.4),
    name = "Cone",
  } = options;

  let { bottomRadius } = options;
  let finalOrientation = orientation;

  // 如果未提供 bottomRadius，根据 coneAngle 计算
  if (bottomRadius === undefined && coneAngle !== undefined) {
    bottomRadius = Math.tan(Cesium.Math.toRadians(coneAngle) / 2) * length;
  }

  // 如果都没有提供，给一个默认值
  if (bottomRadius === undefined) {
    bottomRadius = length / 3;
  }

  // 辅助函数：计算从 currentPos 指向 currentTarget 的四元数
  const calculateOrientation = (currentPos, currentTarget) => {
    if (!currentPos || !currentTarget) return new Cesium.Quaternion();

    // 向量：从目标指向位置（即圆锥的中轴线方向，从底面指向尖端）
    // Cesium Cylinder 默认 Z 轴向上。我们希望 Z 轴从 target 指向 position。
    const zAxis = Cesium.Cartesian3.subtract(currentPos, currentTarget, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(zAxis, zAxis);

    // 归一化后 zAxis 就是我们希望局部 Z 轴对准的世界方向。

    // 我们需要构建一个基底 (x, y, z)。
    // 任意选一个临时向量来计算 x, y。
    const approxUp = Cesium.Cartesian3.normalize(currentPos, new Cesium.Cartesian3()); // 地心到位置

    // 如果 zAxis 和 approxUp 平行，特殊处理
    let xAxis = new Cesium.Cartesian3();
    if (Math.abs(Cesium.Cartesian3.dot(zAxis, approxUp)) > 0.99) {
      // 平行，选另一个轴，比如 (0,1,0)
      Cesium.Cartesian3.cross(zAxis, new Cesium.Cartesian3(0, 1, 0), xAxis);
    } else {
      Cesium.Cartesian3.cross(approxUp, zAxis, xAxis);
    }
    Cesium.Cartesian3.normalize(xAxis, xAxis);

    const yAxis = new Cesium.Cartesian3();
    Cesium.Cartesian3.cross(zAxis, xAxis, yAxis);
    Cesium.Cartesian3.normalize(yAxis, yAxis);

    // 构建旋转矩阵 (列向量)
    const rotationMatrix = new Cesium.Matrix3(
      xAxis.x, yAxis.x, zAxis.x,
      xAxis.y, yAxis.y, zAxis.y,
      xAxis.z, yAxis.z, zAxis.z
    );

    return Cesium.Quaternion.fromRotationMatrix(rotationMatrix);
  };

  // 如果提供了 targetPosition，则计算朝向 (targetPosition 优先级高于 orientation)
  if (targetPosition) {
    // 检查 position 是否为动态属性 (具有 getValue 方法)
    const isDynamic = (position && typeof position.getValue === 'function') ||
      (targetPosition && typeof targetPosition.getValue === 'function');

    if (isDynamic) {
      finalOrientation = new Cesium.CallbackProperty((time) => {
        const currentPos = (position && typeof position.getValue === 'function') ? position.getValue(time) : position;
        const currentTarget = (targetPosition && typeof targetPosition.getValue === 'function') ? targetPosition.getValue(time) : targetPosition;
        return calculateOrientation(currentPos, currentTarget);
      }, false);
    } else {
      // 静态情况直接计算
      finalOrientation = calculateOrientation(position, targetPosition);
    }
  }

  // 计算中心点位置 (将 position 视为顶点/尖端)
  const calculateCenterPosition = (vertexPos, orientationQuat) => {
    if (!vertexPos || !orientationQuat) return vertexPos;
    // 偏移量：从中心点到顶点的向量 (局部坐标系 Z 轴正方向 length/2)
    // 因为 Cylinder topRadius=0, bottomRadius>0, 且 Z 轴指向 Tip
    // 所以 Tip 在局部 (0, 0, length/2)
    // 我们需要将 entity position (中心) 向后移动，使得 Tip 位于 vertexPos
    const offset = new Cesium.Cartesian3(0, 0, length / 2);
    const matrix = Cesium.Matrix3.fromQuaternion(orientationQuat, new Cesium.Matrix3());
    const rotatedOffset = Cesium.Matrix3.multiplyByVector(matrix, offset, new Cesium.Cartesian3());
    return Cesium.Cartesian3.subtract(vertexPos, rotatedOffset, new Cesium.Cartesian3());
  };

  let finalPosition = position;

  // 检查是否需要动态计算位置
  const isPositionDynamic = (position && typeof position.getValue === 'function');
  const isOrientationDynamic = (finalOrientation && typeof finalOrientation.getValue === 'function');

  if (isPositionDynamic || isOrientationDynamic) {
    finalPosition = new Cesium.CallbackProperty((time) => {
      const currentVertex = isPositionDynamic ? position.getValue(time) : position;
      const currentOrientation = isOrientationDynamic ? finalOrientation.getValue(time) : finalOrientation;
      return calculateCenterPosition(currentVertex, currentOrientation);
    }, false);
  } else {
    finalPosition = calculateCenterPosition(position, finalOrientation);
  }

  const entity = viewer.entities.add({
    name: name,
    position: finalPosition,
    orientation: finalOrientation,
    cylinder: {
      length: length,
      topRadius: 0,
      bottomRadius: bottomRadius,
      material: color,
      outline: false,
      outlineColor: color.withAlpha(1.0),
    },
  });

  // 保存原始顶点位置属性，方便其他计算使用（如交集计算）
  entity.vertexPosition = position;

  return entity;
}

/**
 * 创建地面圆形实体
 * @param {Cesium.Viewer} viewer 
 * @param {Object} options 
 * @param {number} options.longitude 经度
 * @param {number} options.latitude 纬度
 * @param {number} options.radius 半径(米)
 * @param {Cesium.Color} [options.color] 填充颜色
 * @param {Cesium.Color} [options.outlineColor] 边框颜色
 * @returns {Cesium.Entity} 地面圆形实体
 */
export function createGroundCircle(viewer, options) {
  const {
    longitude,
    latitude,
    radius,
    color = Cesium.Color.BLUE.withAlpha(0.2),
    outlineColor = Cesium.Color.BLUE
  } = options;

  return viewer.entities.add({
    name: "GroundCircle",
    position: Cesium.Cartesian3.fromDegrees(longitude, latitude, 0),
    ellipse: {
      semiMajorAxis: radius,
      semiMinorAxis: radius,
      material: color,
      outline: true,
      outlineColor: outlineColor,
    },
  });
}