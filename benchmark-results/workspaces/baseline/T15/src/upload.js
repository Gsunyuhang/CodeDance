import { CHUNK_SIZE } from "./constants.js"

export const UPLOAD_CHUNK = CHUNK_SIZE

export function uploadParts(bytes) {
  return Math.ceil(bytes / UPLOAD_CHUNK)
}
