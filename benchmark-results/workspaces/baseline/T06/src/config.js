export function parseConfig(raw) {
  return {
    host: raw.host,
    timeout: (raw.timeout ?? 30).toFixed(0),
  }
}
