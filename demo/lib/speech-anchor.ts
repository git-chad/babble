import {
  Box3,
  Mesh,
  type Object3D,
  type PerspectiveCamera,
  Vector3,
} from "three"
import { placeSpeech } from "./speech-layout"

export function createSpeechAnchor(model: Object3D) {
  const bounds = new Box3()
  model.traverse((object) => {
    // GLTFLoader sanitizes spaces and periods in node names.
    if (object instanceof Mesh && /^(Head|Ear)/.test(object.name))
      bounds.expandByObject(object, true)
  })
  if (bounds.isEmpty()) bounds.setFromObject(model, true)
  const valid =
    !bounds.isEmpty() &&
    [...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)
  const corners: Vector3[] = []
  if (valid) {
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z])
          corners.push(new Vector3(x, y, z))
  }
  return (camera: PerspectiveCamera, width: number, height: number) => {
    if (
      !(
        corners.length &&
        [width, height].every((value) => Number.isFinite(value) && value > 0)
      )
    )
      return null
    const head = { left: 1, right: 0, top: 1, bottom: 0 }
    for (const corner of corners) {
      const point = corner.clone().project(camera)
      if (![point.x, point.y, point.z].every(Number.isFinite)) return null
      const x = (point.x + 1) / 2
      const y = (1 - point.y) / 2
      head.left = Math.min(head.left, x)
      head.right = Math.max(head.right, x)
      head.top = Math.min(head.top, y)
      head.bottom = Math.max(head.bottom, y)
    }
    return placeSpeech(width, height, head)
  }
}
