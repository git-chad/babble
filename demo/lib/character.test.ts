import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import {
  AnimationMixer,
  Box3,
  PerspectiveCamera,
  Texture,
  Vector3,
} from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { createIdleBlink } from "./blink"
import { disposeObjects } from "./resources"
import { createSpeechAnchor } from "./speech-anchor"
import { isSpeechPlacement } from "./speech-layout"
import { frameCharacter } from "./viewer"

test("approved cat stays byte-identical, with its four-second Idle and correct atlas blink", async () => {
  const bytes = await Bun.file(
    "demo/public/character/gato_idle_v03.glb",
  ).arrayBuffer()
  expect(createHash("sha256").update(new Uint8Array(bytes)).digest("hex")).toBe(
    "5ab17da8fd00db152a6779a5ec30dd4655eb10b60d63fc4430a03110465dbc4d",
  )
  const loader = new GLTFLoader()
  loader.register(() => ({
    name: "CPU_TEXTURE_STUB",
    loadTexture: async () => new Texture(),
  }))
  const gltf = await loader.parseAsync(bytes, "")
  const clip = gltf.animations.find((clip) => clip.name === "Idle")!
  expect(clip.duration).toBe(4)
  const mixer = new AnimationMixer(gltf.scene)
  mixer.clipAction(clip).play()
  mixer.update(0)
  gltf.scene.updateMatrixWorld(true)
  const blink = createIdleBlink(gltf.scene)
  expect(blink(0)).toBe(0)
  expect(blink(2.3333333333333335)).toBe(6)
  expect(blink(2.4583333333333335)).toBe(0)
  const bounds = new Box3().setFromObject(gltf.scene, true)
  const anchor = createSpeechAnchor(gltf.scene)
  const camera = new PerspectiveCamera(35, 1, 0.1, 200)
  for (const [width, height] of [
    [330, 380],
    [600, 540],
    [980, 720],
    [1440, 820],
  ] as const) {
    frameCharacter(camera, bounds, width, height)
    expect(isSpeechPlacement(anchor(camera, width, height))).toBe(true)
    for (const time of [0, 1, 2, 3]) {
      mixer.setTime(time)
      gltf.scene.updateMatrixWorld(true)
      const pose = new Box3().setFromObject(gltf.scene, true)
      for (const x of [pose.min.x, pose.max.x])
        for (const y of [pose.min.y, pose.max.y])
          for (const z of [pose.min.z, pose.max.z]) {
            const point = new Vector3(x, y, z).project(camera)
            expect(Math.abs(point.x)).toBeLessThan(1)
            expect(Math.abs(point.y)).toBeLessThan(1)
          }
    }
  }
  mixer.stopAllAction()
  mixer.uncacheRoot(gltf.scene)
  disposeObjects(gltf.scene)
})
