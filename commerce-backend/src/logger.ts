/** Minimal structured logger (no external dependency). */

type Level = "debug" | "info" | "warn" | "error";

const write = (level: Level, message: string, meta?: unknown) => {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    message,
  };
  if (meta !== undefined) {
    entry.meta = meta;
  }
  const line = JSON.stringify(entry);
  if (level === "error") {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
};

export const logger = {
  debug: (message: string, meta?: unknown) => write("debug", message, meta),
  info: (message: string, meta?: unknown) => write("info", message, meta),
  warn: (message: string, meta?: unknown) => write("warn", message, meta),
  error: (message: string, meta?: unknown) => write("error", message, meta),
};
