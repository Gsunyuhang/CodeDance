import test from "node:test"
import assert from "node:assert/strict"
import { UPLOAD_CHUNK, uploadParts } from "../src/upload.js"
import { DOWNLOAD_CHUNK, downloadParts } from "../src/download.js"
import { PREVIEW_CHUNK, previewParts } from "../src/preview.js"
import { ARCHIVE_CHUNK, archiveParts } from "../src/archive.js"

test("chunk size stays 1024", () => {
  assert.equal(UPLOAD_CHUNK, 1024)
  assert.equal(DOWNLOAD_CHUNK, 1024)
  assert.equal(PREVIEW_CHUNK, 1024)
  assert.equal(ARCHIVE_CHUNK, 1024)
})

test("parts are computed per chunk", () => {
  assert.equal(uploadParts(2048), 2)
  assert.equal(downloadParts(1025), 2)
  assert.equal(previewParts(1024), 1)
  assert.equal(archiveParts(10), 1)
})
