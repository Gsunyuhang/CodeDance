import { CHUNK_SIZE } from "./constants.js"

export const PREVIEW_CHUNK = CHUNK_SIZE

export function previewParts(bytes) {
  return Math.ceil(bytes / PREVIEW_CHUNK)
}
