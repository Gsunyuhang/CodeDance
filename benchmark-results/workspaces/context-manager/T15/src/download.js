import { CHUNK_SIZE } from "./constants.js"

export const DOWNLOAD_CHUNK = CHUNK_SIZE

export function downloadParts(bytes) {
  return Math.ceil(bytes / DOWNLOAD_CHUNK)
}
