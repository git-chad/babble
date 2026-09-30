import {
  Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type Texture,
} from "three"
import atlas from "../public/character/atlas.json"
import cues from "../public/character/blink_events.json"

/** Typed adaptation of the approved model's idle-blink-runtime.mjs.
 * glTF uses top-left offsets with flipY=false, unlike the Blender offsets.
 */
export function createIdleBlink(root: Object3D) {
  const maps = new Set<Texture>()
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material]
    for (const material of materials) {
      if (material.name !== "FACE_ATLAS") continue
      const face = material as MeshStandardMaterial
      if (!face.map) continue
      face.transparent = true
      face.depthWrite = false
      face.map.flipY = false
      face.map.repeat.set(1 / atlas.columns, 1 / atlas.rows)
      maps.add(face.map)
    }
  })
  if (!maps.size) throw new Error("Buddy's FACE_ATLAS texture is missing")

  let previous = -1
  return (clipTime: number, baseExpression = cues.base_expression) => {
    if (!Number.isFinite(clipTime)) {
      throw new TypeError("clipTime must be finite seconds")
    }
    if (
      !(Number.isInteger(baseExpression) && atlas.expressions[baseExpression])
    ) {
      throw new RangeError("Unknown buddy expression")
    }
    const t =
      ((clipTime % cues.duration_seconds) + cues.duration_seconds) %
      cues.duration_seconds
    const event = cues.events.find(
      (entry) => t >= entry.start_seconds && t < entry.end_seconds,
    )
    const index =
      baseExpression === cues.base_expression && event
        ? event.expression_index
        : baseExpression
    if (index !== previous) {
      const cell = atlas.expressions[index]!
      for (const map of maps) {
        map.offset.set(cell.gltf_uv_offset[0]!, cell.gltf_uv_offset[1]!)
        map.updateMatrix()
      }
      previous = index
    }
    return index
  }
}
