import * as Cesium from 'cesium'

/**
 * 创建一个指向地面上目标点的圆锥模型
 * @param {Cesium.Viewer} viewer 
 * @param {Object} options 
 * @param {Cesium.Cartesian3} options.position 圆锥底面中心位置
 * @param {Number} options.length 圆锥长度
 * @param {Number} options.coneAngle 圆锥角度（弧度）
 * @param {Cesium.Quaternion} options.orientation 圆锥方向四元数
 * @param {Cesium.Cartesian3} options.targetPosition 地面上的目标点
 * @param {String} options.modelUrl 模型路径
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
    modelUrl, // 新增参数：模型路径
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

  const entity = viewer.entities.add({
    name: name,
    position: position, // 这里还是使用中心点位置，如果需要“顶点位置”，需要外部传入偏移后的中心点
    orientation: finalOrientation,
    cylinder: {
      length: length,
      topRadius: 0,
      bottomRadius: bottomRadius,
      material: color,
      outline: true,
      outlineColor: color.withAlpha(1.0),
    },
  });

  // 如果提供了模型路径，则在圆锥位置创建模型
  if (modelUrl) {
    viewer.entities.add({
      name: name + "-Model",
      position: position,
      orientation: finalOrientation, // 模型使用相同的朝向
      model: {
        uri: modelUrl,
        minimumPixelSize: 64,
        maximumScale: 20000,
      },
    });
  }

  return entity;
}