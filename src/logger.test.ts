import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import type { LoggingConfig } from "./logger.js";

const originalForceColor = process.env.FORCE_COLOR;
process.env.FORCE_COLOR = "1";
const { logDebugTranscript } = await import("./logger.js");

const output: string[] = [];
const originalLog = console.log;
console.log = (...values: unknown[]) => output.push(values.map(String).join(" "));

const baseConfig: LoggingConfig = {
  level: "debug",
  format: "pretty",
  requests: true,
  assets: false,
  toolCalls: true,
  shellCommands: false,
  trustProxy: false,
};

try {
  logDebugTranscript(
    baseConfig,
    "tool_debug",
    "$ ls -lh archive.tgz",
    "-rw-r--r-- 1 user user 3.5M archive.tgz\n",
    { tool: "exec_command", workspaceId: "workspace-a" },
  );
  assert.equal(output.length, 1);
  assert.match(output[0]!, /\x1b\[/);
  const prettyOutput = stripVTControlCharacters(output[0]!);
  const timestamp = prettyOutput.split(" │ DEBUG")[0]!;
  assert.match(timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
  assert.equal(timestamp.slice(-6), systemUtcOffset());
  assert.match(prettyOutput, /DEBUG │ tool_debug/);
  assert.match(prettyOutput, /tool="exec_command"/);
  assert.match(prettyOutput, /\$ ls -lh archive\.tgz\n-rw-r--r-- 1 user user 3\.5M archive\.tgz$/);

  output.length = 0;
  logDebugTranscript(
    baseConfig,
    "tool_debug",
    "Apply patch [files=1, additions=1, removals=1]",
    "@@ -1 +1 @@\n-before\n+after",
    { tool: "apply_patch" },
  );
  assert.match(output[0]!, /\x1b\[31m-before\x1b\[39m/);
  assert.match(output[0]!, /\x1b\[32m\+after\x1b\[39m/);

  output.length = 0;
  logDebugTranscript(
    { ...baseConfig, format: "json" },
    "tool_debug",
    "Read src/logger.ts [offset=1, limit=20]",
    "1: import type { Request } from \"express\";\n",
    { tool: "read" },
  );
  assert.equal(output.length, 1);
  const jsonOutput = JSON.parse(output[0]!) as Record<string, unknown>;
  assert.match(String(jsonOutput.ts), /Z$/);
  assert.deepEqual(jsonOutput, {
    ...jsonOutput,
    level: "debug",
    event: "tool_debug",
    tool: "read",
    headline: "Read src/logger.ts [offset=1, limit=20]",
    output: "1: import type { Request } from \"express\";",
  });

  output.length = 0;
  logDebugTranscript(
    { ...baseConfig, level: "info" },
    "tool_debug",
    "$ npm test",
    "ok",
  );
  assert.equal(output.length, 0);
} finally {
  console.log = originalLog;
  if (originalForceColor === undefined) delete process.env.FORCE_COLOR;
  else process.env.FORCE_COLOR = originalForceColor;
}

function systemUtcOffset(): string {
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const hours = Math.floor(Math.abs(offsetMinutes) / 60).toString().padStart(2, "0");
  const minutes = (Math.abs(offsetMinutes) % 60).toString().padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}
