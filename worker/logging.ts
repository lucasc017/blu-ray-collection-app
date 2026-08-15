export type LogLevel = "info" | "warn" | "error";

export function logEvent(
  level: LogLevel,
  event: string,
  fields: Record<string, string | number | boolean | null> = {},
): void {
  const payload = JSON.stringify({ level, event, timestamp: new Date().toISOString(), ...fields });
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.log(payload);
}
