export const ARCHIVE_CHUNK = 1024

export function archiveParts(bytes) {
  return Math.ceil(bytes / ARCHIVE_CHUNK)
}
