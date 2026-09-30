import {
  type BufferGeometry,
  InstancedMesh,
  type Material,
  Mesh,
  type Object3D,
  type Skeleton,
  SkinnedMesh,
  Texture,
} from "three"

export function disposeObjects(root: Object3D) {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()
  const skeletons = new Set<Skeleton>()
  const bitmaps = new Set<ImageBitmap>()
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    geometries.add(object.geometry)
    if (object instanceof InstancedMesh) object.dispose()
    if (object instanceof SkinnedMesh) skeletons.add(object.skeleton)
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material]
    for (const material of [
      ...objectMaterials,
      object.customDepthMaterial,
      object.customDistanceMaterial,
    ]) {
      if (!material) continue
      materials.add(material)
      for (const value of Object.values(material)) {
        if (value instanceof Texture) textures.add(value)
      }
    }
  })
  for (const geometry of geometries) geometry.dispose()
  for (const texture of textures) {
    if (
      typeof ImageBitmap !== "undefined" &&
      texture.image instanceof ImageBitmap
    ) {
      bitmaps.add(texture.image)
    }
    texture.dispose()
  }
  for (const bitmap of bitmaps) bitmap.close()
  for (const material of materials) material.dispose()
  for (const skeleton of skeletons) skeleton.dispose()
}
