export type ProjectedHead = {
  left: number
  right: number
  top: number
  bottom: number
}
export type SpeechPlacement = {
  left: number
  top: number
  width: number
  maxHeight: number
  fontSize: number
  above: boolean
}

export function isSpeechPlacement(
  value: SpeechPlacement | null,
): value is SpeechPlacement {
  return (
    value !== null &&
    [value.left, value.top, value.width, value.maxHeight, value.fontSize].every(
      Number.isFinite,
    ) &&
    value.left >= 0 &&
    value.top >= 0 &&
    value.width > 0 &&
    value.maxHeight > 0 &&
    value.fontSize > 0
  )
}

/** CSS-pixel placement from the actual cropped camera's projected head bounds. */
export function placeSpeech(
  width: number,
  height: number,
  head: ProjectedHead,
): SpeechPlacement | null {
  if (
    !(
      [width, height].every((value) => Number.isFinite(value) && value > 0) &&
      Object.values(head).every(Number.isFinite)
    )
  )
    return null
  const margin = Math.min(24, width * 0.05)
  const gap = Math.max(18, width * 0.018)
  const fontSize = 14
  const right = head.right * width + gap
  const available = width - right - margin
  if (available >= Math.min(240, width * 0.55)) {
    const top = Math.max(
      margin,
      Math.min(height - fontSize * 2, head.top * height + fontSize * 0.25),
    )
    return {
      left: right,
      top,
      width: Math.min(420, width * 0.34, available),
      maxHeight: height - top - margin,
      fontSize,
      above: false,
    }
  }
  const top = Math.max(margin + fontSize * 2, head.top * height - gap)
  const textWidth = Math.min(420, width - margin * 2)
  const center = ((head.left + head.right) * width) / 2
  return {
    left: Math.max(
      margin,
      Math.min(width - margin - textWidth, center - textWidth / 2),
    ),
    top,
    width: textWidth,
    maxHeight: Math.max(fontSize * 2, top - margin),
    fontSize,
    above: true,
  }
}
