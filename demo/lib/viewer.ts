import {
  AnimationClip,
  AnimationMixer,
  Box3,
  CanvasTexture,
  Color,
  DirectionalLight,
  HemisphereLight,
  LoopRepeat,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { createIdleBlink } from "./blink"
import { disposeObjects } from "./resources"
import { createSpeechAnchor } from "./speech-anchor"
import type { SpeechPlacement } from "./speech-layout"

export function frameCharacter(
  camera: PerspectiveCamera,
  bounds: Box3,
  width: number,
  height: number,
) {
  const center = bounds.getCenter(new Vector3())
  const size = bounds.getSize(new Vector3())
  camera.aspect = width / height
  const tangent = Math.tan((35 * Math.PI) / 360)
  const distance =
    Math.max(
      size.y / (2 * tangent * 0.7),
      size.x / (2 * tangent * camera.aspect * 0.7),
    ) +
    size.z / 2
  const x = center.x
  const y = center.y + size.y * 0.07
  camera.position.set(x, y, center.z + distance)
  camera.lookAt(x, y, center.z)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
}

/** Character-only viewer; the exported rig, atlas and Idle remain untouched. */
export async function createViewer(
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
  placed: (placement: SpeechPlacement | null) => void,
) {
  const scene = new Scene()
  scene.background = new Color("white")
  let renderer: WebGLRenderer | undefined
  let mixer: AnimationMixer | undefined
  try {
    const response = await fetch("/character/gato_idle_v03.glb", { signal })
    if (!response.ok) throw new Error(`Character returned ${response.status}`)
    const gltf = await new GLTFLoader().parseAsync(
      await response.arrayBuffer(),
      "/character/",
    )
    scene.add(gltf.scene)
    signal.throwIfAborted()
    const model = gltf.scene
    const clip = AnimationClip.findByName(gltf.animations, "Idle")
    if (!clip || Math.abs(clip.duration - 4) > 0.001)
      throw new Error("Four-second Idle is missing")
    mixer = new AnimationMixer(model)
    const action = mixer.clipAction(clip).setLoop(LoopRepeat, Infinity).play()
    mixer.update(0)
    scene.updateMatrixWorld(true)
    const blink = createIdleBlink(model)
    blink(0)
    const bounds = new Box3().setFromObject(model, true)
    const center = bounds.getCenter(new Vector3())
    const size = bounds.getSize(new Vector3())
    const speechAnchor = createSpeechAnchor(model)

    const shadowCanvas = document.createElement("canvas")
    shadowCanvas.width = shadowCanvas.height = 128
    const paint = shadowCanvas.getContext("2d")!
    const gradient = paint.createRadialGradient(64, 64, 3, 64, 64, 64)
    gradient.addColorStop(0, "rgba(0,0,0,0.15)")
    gradient.addColorStop(0.5, "rgba(0,0,0,0.07)")
    gradient.addColorStop(1, "rgba(0,0,0,0)")
    paint.fillStyle = gradient
    paint.fillRect(0, 0, 128, 128)
    const shadow = new Mesh(
      new PlaneGeometry(size.x * 1.1, size.x * 0.65),
      new MeshBasicMaterial({
        map: new CanvasTexture(shadowCanvas),
        transparent: true,
        depthWrite: false,
      }),
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.set(center.x, bounds.min.y + 0.005, center.z)
    scene.add(shadow, new HemisphereLight(0xffffff, 0xd5d1ca, 2.2))
    const key = new DirectionalLight(0xfff5e8, 2.5)
    key.position.set(-4, 10, 8)
    const fill = new DirectionalLight(0xffffff, 0.65)
    fill.position.set(4, 4, 6)
    scene.add(key, fill)
    renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false })
    renderer.outputColorSpace = SRGBColorSpace
    const gl = renderer
    const animation = mixer
    const camera = new PerspectiveCamera(35, 1, 0.1, 200)
    let frame = 0
    let previous = 0
    let disposed = false
    let playing = false
    const render = () => gl.render(scene, camera)
    const resize = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (width <= 0 || height <= 0 || disposed) return
      frameCharacter(camera, bounds, width, height)
      gl.setPixelRatio(1)
      gl.setSize(
        Math.max(1, Math.round(width / 2)),
        Math.max(1, Math.round(height / 2)),
        false,
      )
      placed(speechAnchor(camera, width, height))
      render()
    }
    const tick = (now: number) => {
      if (!playing || disposed) return
      frame = requestAnimationFrame(tick)
      if (previous && now - previous < 1000 / 29) return
      const delta = previous ? (now - previous) / 1000 : 0
      previous = now
      animation.update(delta)
      blink(action.time)
      render()
    }
    resize()
    return {
      resize,
      setPlaying(next: boolean) {
        if (disposed || playing === next) return
        playing = next
        previous = 0
        cancelAnimationFrame(frame)
        if (playing) frame = requestAnimationFrame(tick)
        else render()
      },
      dispose() {
        if (disposed) return
        disposed = true
        cancelAnimationFrame(frame)
        animation.stopAllAction()
        animation.uncacheRoot(model)
        disposeObjects(scene)
        gl.dispose()
        gl.forceContextLoss()
      },
    }
  } catch (error) {
    mixer?.stopAllAction()
    disposeObjects(scene)
    renderer?.dispose()
    renderer?.forceContextLoss()
    throw error
  }
}
