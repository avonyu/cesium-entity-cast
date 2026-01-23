import * as Cesium from 'cesium'

/**
 * 创建一个指向地面上目标点的圆锥模型，要求：
 * 1. position为圆锥尖端位置，使用`viewer.entities.getById(实体ID).position`更新position时也是更新圆锥尖端位置
 * 2. orientation为圆锥方向四元数，使用`viewer.entities.getById(实体ID).orientation`更新orientation时也是更新圆锥方向
 * 3. targetPosition的优先级比orientation高，若targetPosition为null，则使用orientation
 * 4. 若targetPosition不为null，则根据position和targetPosition计算orientation
 * 5. 已创建的实体若传入targetPosition，会自动更新orientation
 * 6. 若isTargetOrientation为true，则根据targetPosition计算orientation
 * @param {Cesium.Viewer} viewer 
 * @param {Object} options 
 * @param {String} [options.id] 实体ID
 * @param {Cesium.Cartesian3} options.position 圆锥顶点位置 (尖端)
 * @param {Number} options.length 圆锥长度
 * @param {Number} options.coneAngle 圆锥切面的最大夹角（弧度）
 * @param {Cesium.Quaternion} [options.orientation] 圆锥方向四元数
 * @param {Cesium.Cartesian3} [options.targetPosition] 地面上的目标点
 * @param {Boolean} [options.isTargetOrientation=false] 是否启用目标点朝向
 * @param {Cesium.Color} [options.color] 圆锥颜色
 * @param {String} [options.name] 圆锥名称
 * @returns {Cesium.Entity} 圆锥实体
 */
export function createCone(viewer, options) {
  const {
    id,
    length,
    coneAngle,
    position,
    orientation,
    targetPosition = null,
    isTargetOrientation = false,
    color = Cesium.Color.RED.withAlpha(0.5),
    name = "cone"
  } = options;

  // 1. Create the Tip Entity (the handle returned to the user)
  const tipEntity = viewer.entities.add({
    id: id,
    name: name,
    position: position,
  });

  // Custom properties for internal logic
  tipEntity.addProperty('targetPosition');
  tipEntity.targetPosition = targetPosition;

  tipEntity.addProperty('isTargetOrientation');
  tipEntity.isTargetOrientation = isTargetOrientation;

  tipEntity.addProperty('coneLength');
  tipEntity.coneLength = length;

  tipEntity.addProperty('coneAngle');
  tipEntity.coneAngle = coneAngle;

  // Internal storage for manual orientation (fallback)
  let _manualOrientation = orientation || Cesium.Quaternion.IDENTITY;

  // 2. Define Orientation Property for Tip Entity
  // We use Object.defineProperty to intercept assignments to .orientation
  // This ensures that even if the user sets .orientation, our logic (targetPosition priority) remains active.
  const masterOrientation = new Cesium.CallbackProperty((time) => {
    // Check if we should use target orientation
    const useTarget = tipEntity.isTargetOrientation instanceof Cesium.Property
      ? tipEntity.isTargetOrientation.getValue(time)
      : tipEntity.isTargetOrientation;

    const currentPos = tipEntity.position ? tipEntity.position.getValue(time) : undefined;
    const currentTarget = tipEntity.targetPosition instanceof Cesium.Property
      ? tipEntity.targetPosition.getValue(time)
      : tipEntity.targetPosition;

    // Condition: useTarget is true AND we have both positions
    if (useTarget && currentPos && currentTarget) {
      // Vector from Target to Tip (align +Z with this to point tip at Pos)
      const direction = Cesium.Cartesian3.subtract(currentPos, currentTarget, new Cesium.Cartesian3());
      Cesium.Cartesian3.normalize(direction, direction);

      // Calculate Up vector (approximate)
      const up = Cesium.Cartesian3.normalize(currentPos, new Cesium.Cartesian3());

      // Calculate Right vector
      const right = Cesium.Cartesian3.cross(up, direction, new Cesium.Cartesian3());
      if (Cesium.Cartesian3.magnitudeSquared(right) < Cesium.Math.EPSILON10) {
        // Degenerate case (direction parallel to up), pick arbitrary axis
        Cesium.Cartesian3.cross(Cesium.Cartesian3.UNIT_X, direction, right);
      }
      Cesium.Cartesian3.normalize(right, right);

      // Recalculate Up
      const realUp = Cesium.Cartesian3.cross(direction, right, new Cesium.Cartesian3());
      Cesium.Cartesian3.normalize(realUp, realUp);

      // Rotation Matrix [Right, RealUp, Direction]
      const rotationMatrix = new Cesium.Matrix3(
        right.x, realUp.x, direction.x,
        right.y, realUp.y, direction.y,
        right.z, realUp.z, direction.z
      );

      return Cesium.Quaternion.fromRotationMatrix(rotationMatrix);
    }

    // Fallback to manual orientation
    return _manualOrientation instanceof Cesium.Property
      ? _manualOrientation.getValue(time)
      : _manualOrientation;
  }, false);

  // Override the orientation property on the instance
  Object.defineProperty(tipEntity, 'orientation', {
    get: () => masterOrientation,
    set: (value) => {
      _manualOrientation = value;
    },
    configurable: true,
    enumerable: true
  });

  // 3. Create the Visual Entity (Internal)
  // We use a separate entity for the graphic to allow offsetting the center while keeping tipEntity.position as the tip
  const visualEntity = viewer.entities.add({
    cylinder: {
      length: new Cesium.CallbackProperty((time) => {
        return tipEntity.coneLength instanceof Cesium.Property
          ? tipEntity.coneLength.getValue(time)
          : tipEntity.coneLength;
      }, false),
      topRadius: 0.0,
      bottomRadius: new Cesium.CallbackProperty((time) => {
        const l = tipEntity.coneLength instanceof Cesium.Property ? tipEntity.coneLength.getValue(time) : tipEntity.coneLength;
        const a = tipEntity.coneAngle instanceof Cesium.Property ? tipEntity.coneAngle.getValue(time) : tipEntity.coneAngle;
        return l * Math.tan(a / 2);
      }, false),
      material: color,
    }
  });

  // 4. Bind Visual Position
  visualEntity.position = new Cesium.CallbackProperty((time) => {
    // Cleanup check: if tipEntity is removed, remove visualEntity
    if (!viewer.entities.getById(id)) {
      viewer.entities.remove(visualEntity);
      return undefined;
    }

    const pos = tipEntity.position.getValue(time);
    const orient = tipEntity.orientation.getValue(time);
    const len = tipEntity.coneLength instanceof Cesium.Property ? tipEntity.coneLength.getValue(time) : tipEntity.coneLength;

    if (pos && orient && len) {
      // Tip is at +Z (L/2). Base is at -Z (-L/2).
      // We want Tip to be at `pos`.
      // Center = Tip - Rotation * (0, 0, L/2)

      const offsetLocal = new Cesium.Cartesian3(0, 0, len / 2);
      const rotMatrix = Cesium.Matrix3.fromQuaternion(orient, new Cesium.Matrix3());
      const offsetWorld = Cesium.Matrix3.multiplyByVector(rotMatrix, offsetLocal, new Cesium.Cartesian3());

      return Cesium.Cartesian3.subtract(pos, offsetWorld, new Cesium.Cartesian3());
    }
    return pos;
  }, false);

  // 5. Bind Visual Orientation
  visualEntity.orientation = new Cesium.CallbackProperty((time) => {
    if (!viewer.entities.getById(id)) return undefined;
    return tipEntity.orientation.getValue(time);
  }, false);

  return tipEntity;
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
    id,
    longitude,
    latitude,
    radius,
    color = Cesium.Color.BLUE.withAlpha(0.2),
    outlineColor = Cesium.Color.BLUE
  } = options;

  return viewer.entities.add({
    id: id,
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
