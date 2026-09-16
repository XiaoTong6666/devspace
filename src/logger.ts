import type { Request } from "express";
import colors from "picocolors";

export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";
export type LogFormat = "json" | "pretty";

export interface LoggingConfig {
  level: LogLevel;
  format: LogFormat;
  requests: boolean;
  assets: boolean;
  toolCalls: boolean;
  shellCommands: boolean;
  trustProxy: boolean;
}

type LogFields = Record<string, unknown>;

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

export function shouldLog(config: LoggingConfig, level: Exclude<LogLevel, "silent">): boolean {
  return LEVEL_WEIGHT[config.level] >= LEVEL_WEIGHT[level];
}

export function logEvent(
  config: LoggingConfig,
  level: Exclude<LogLevel, "silent">,
  event: string,
  fields: LogFields = {},
): void {
  if (!shouldLog(config, level)) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  };

  const line = config.format === "pretty" ? formatPretty(entry) : JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logDebugTranscript(
  config: LoggingConfig,
  event: string,
  headline: string,
  output?: string,
  fields: LogFields = {},
): void {
  if (!shouldLog(config, "debug")) return;

  const normalizedOutput = output?.replace(/\n+$/, "");
  if (config.format === "json") {
    logEvent(config, "debug", event, {
      ...fields,
      headline,
      output: normalizedOutput || undefined,
    });
    return;
  }

  const prefix = formatPretty({
    ts: new Date().toISOString(),
    level: "debug",
    event,
    ...fields,
  });
  const tool = typeof fields.tool === "string" ? fields.tool : undefined;
  console.log([
    prefix,
    formatTranscriptHeadline(headline, tool),
    normalizedOutput ? formatTranscriptOutput(normalizedOutput, tool) : undefined,
  ].filter(Boolean).join("\n"));
}

export function requestIp(req: Request, trustProxy: boolean): string | undefined {
  if (trustProxy) {
    const cfConnectingIp = firstHeaderValue(req.header("cf-connecting-ip"));
    if (cfConnectingIp) return cfConnectingIp;

    const forwardedFor = firstHeaderValue(req.header("x-forwarded-for"));
    if (forwardedFor) return forwardedFor;
  }

  return req.ip ?? req.socket.remoteAddress;
}

export function requestPath(req: Request): string {
  return req.path || req.url.split("?")[0] || req.url;
}

export function sessionIdPrefix(sessionId: string | undefined): string | undefined {
  return sessionId ? sessionId.slice(0, 8) : undefined;
}

export function commandPreview(command: string): string {
  const normalized = command.replace(/\s+/g, " ").trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function firstHeaderValue(value: string | undefined): string | undefined {
  return value?.split(",")[0]?.trim() || undefined;
}

function formatPretty(entry: LogFields): string {
  const ts = formatLocalTimestamp(String(entry.ts));
  const level = String(entry.level).toUpperCase();
  const event = String(entry.event);
  const rest = Object.entries(entry)
    .filter(([key, value]) => !["ts", "level", "event"].includes(key) && value !== undefined)
    .map(([key, value]) => `${colors.dim(key)}=${formatPrettyValue(value)}`)
    .join(" ");

  const prefix = [
    colors.dim(ts),
    colors.dim("│"),
    formatPrettyLevel(level),
    colors.dim("│"),
    colors.bold(event),
  ].join(" ");
  return rest ? `${prefix} ${colors.dim("│")} ${rest}` : prefix;
}

function formatLocalTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60).toString().padStart(2, "0");
  const offsetRemainder = (Math.abs(offsetMinutes) % 60).toString().padStart(2, "0");
  const localTime = new Date(date.getTime() + offsetMinutes * 60_000)
    .toISOString()
    .slice(0, -1);
  return `${localTime}${sign}${offsetHours}:${offsetRemainder}`;
}

function formatPrettyValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  return JSON.stringify(value);
}

function formatPrettyLevel(level: string): string {
  const label = level.padEnd(5);
  switch (level) {
    case "ERROR":
      return colors.bold(colors.red(label));
    case "WARN":
      return colors.bold(colors.yellow(label));
    case "INFO":
      return colors.green(label);
    case "DEBUG":
      return colors.cyan(label);
    default:
      return label;
  }
}

function formatTranscriptHeadline(headline: string, tool: string | undefined): string {
  if (tool === "exec_command") {
    return headline
      .split("\n")
      .map((line) => line.startsWith("$ ") ? colors.bold(colors.cyan(line)) : colors.dim(line))
      .join("\n");
  }
  if (tool === "apply_patch") return colors.bold(colors.magenta(headline));
  if (tool === "grep") return colors.bold(colors.magenta(headline));
  if (tool === "glob") return colors.bold(colors.cyan(headline));
  if (tool === "write_stdin") return colors.bold(colors.yellow(headline));
  return colors.bold(colors.blue(headline));
}

function formatTranscriptOutput(output: string, tool: string | undefined): string {
  if (tool === "apply_patch") return formatPatchOutput(output);
  if (tool === "exec_command" || tool === "write_stdin") return formatProcessOutput(output);
  return output;
}

function formatPatchOutput(output: string): string {
  return output
    .split("\n")
    .map((line) => {
      if (line.startsWith("diff --git ")) return colors.bold(line);
      if (line.startsWith("@@")) return colors.cyan(line);
      if (line.startsWith("+++")) return colors.green(line);
      if (line.startsWith("---")) return colors.red(line);
      if (line.startsWith("+")) return colors.green(line);
      if (line.startsWith("-")) return colors.red(line);
      return line;
    })
    .join("\n");
}

function formatProcessOutput(output: string): string {
  return output
    .split("\n")
    .map((line) => {
      if (line === "Process exited with code 0.") return colors.green(line);
      if (line.startsWith("Process exited")) return colors.red(line);
      if (line.startsWith("Process running")) return colors.yellow(line);
      return line;
    })
    .join("\n");
}
