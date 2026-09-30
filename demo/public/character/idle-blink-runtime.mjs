/** Apply the supplied atlas blink alongside the real skeletal Idle clip.
 * root: GLTFLoader result.scene; cues: parsed blink_events.json.
 * Call the returned function AFTER mixer.update(), with Idle action.time.
 */
export function createIdleBlink(root, cues) {
  const maps = new Set()
  root.traverse((object) => {
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (material?.name !== "FACE_ATLAS" || !material.map) continue
      material.transparent = true
      material.depthWrite = false
      material.map.flipY = false
      material.map.repeat.set(0.25, 0.5)
      maps.add(material.map)
    }
  })
  if (!maps.size) throw new Error("FACE_ATLAS was not found on the loaded GLB.")
  let previous = -1
  return function updateIdleBlink(clipTime, baseExpression = 0) {
    if (!Number.isFinite(clipTime))
      throw new TypeError("clipTime must be finite seconds.")
    if (
      !Number.isInteger(baseExpression) ||
      baseExpression < 0 ||
      baseExpression > 7
    ) {
      throw new RangeError("baseExpression must be an integer from 0 to 7.")
    }
    const t =
      ((clipTime % cues.duration_seconds) + cues.duration_seconds) %
      cues.duration_seconds
    const event = cues.events.find(
      (e) => t >= e.start_seconds && t < e.end_seconds,
    )
    // Cell 6 shares neutral eyebrows/mouth. Other expressions stay selected.
    const index =
      baseExpression === cues.base_expression && event
        ? event.expression_index
        : baseExpression
    if (index !== previous) {
      for (const map of maps) {
        map.offset.set((index % 4) / 4, Math.floor(index / 4) / 2)
        map.updateMatrix()
      }
      previous = index
    }
    return index
  }
}
