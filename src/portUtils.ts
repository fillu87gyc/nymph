export function resolvePortOverride(
  portOverride: number | null,
  envPort: string | undefined,
): number | null {
  if (portOverride !== null) return portOverride;
  if (envPort !== undefined && envPort !== '') {
    const n = Number(envPort);
    if (!Number.isNaN(n) && n > 0 && n <= 65535) return n;
  }
  return null;
}
