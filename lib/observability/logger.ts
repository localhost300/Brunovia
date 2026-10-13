type Level = "info" | "warn" | "error";
type Context = Record<string, unknown>;

function write(level: Level, message: string, context: Context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "peopleflow-web",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    message,
    ...context,
  };
  const serialized = JSON.stringify(entry);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.info(serialized);
}

export const logger = {
  info: (message: string, context?: Context) => write("info", message, context),
  warn: (message: string, context?: Context) => write("warn", message, context),
  error: (message: string, error?: unknown, context: Context = {}) =>
    write("error", message, {
      ...context,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : String(error),
    }),
};
