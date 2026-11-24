/**
 * Minimal structured logger. Emits one JSON line per event so logs can be
 * shipped to any collector (CloudWatch, Loki, Datadog) without a heavy
 * dependency.
 */

type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, message: string, meta: Record<string, unknown> = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    service: "baba-api",
    message,
    ...meta,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (m: string, meta?: Record<string, unknown>) => emit("debug", m, meta),
  info: (m: string, meta?: Record<string, unknown>) => emit("info", m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => emit("warn", m, meta),
  error: (m: string, meta?: Record<string, unknown>) => emit("error", m, meta),
};
