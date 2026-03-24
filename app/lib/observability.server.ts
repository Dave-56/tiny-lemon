type LogLevel = "info" | "warn" | "error";

function stripUndefined(data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  );
}

export function logServerEvent(
  level: LogLevel,
  event: string,
  data: Record<string, unknown> = {},
) {
  console[level](`[${event}]`, stripUndefined(data));
}
