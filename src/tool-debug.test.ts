import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { stripVTControlCharacters } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadConfig } from "./config.js";
import { ProcessSessionManager } from "./process-sessions.js";
import { createReviewCheckpointManager } from "./review-checkpoints.js";
import { createMcpServer } from "./server.js";
import { SqliteWorkspaceStore } from "./workspace-store.js";
import { WorkspaceRegistry } from "./workspaces.js";

test("debug logging prints OpenCode-style tool calls and results", async () => {
  const root = await mkdtemp(join(tmpdir(), "devspace-tool-debug-"));
  const project = join(root, "project");
  const stateDir = join(root, ".state");
  await mkdir(project, { recursive: true });
  await writeFile(join(project, "AGENTS.md"), "project instructions\n");
  await writeFile(join(project, "sample.txt"), "before\n");

  const config = loadConfig({
    DEVSPACE_CONFIG_DIR: join(root, ".config"),
    DEVSPACE_ALLOWED_ROOTS: root,
    DEVSPACE_AGENT_DIR: join(root, "agent"),
    DEVSPACE_LOG_LEVEL: "debug",
    DEVSPACE_OAUTH_OWNER_TOKEN: "test-owner-token-that-is-long-enough",
    PORT: "1",
  });
  const store = new SqliteWorkspaceStore(stateDir);
  const server = createMcpServer(
    config,
    new WorkspaceRegistry(config, store),
    createReviewCheckpointManager(),
    new ProcessSessionManager(),
    [],
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "devspace-debug-test-client", version: "1.0.0" });
  const output: string[] = [];
  const originalLog = console.log;
  console.log = (...values: unknown[]) => output.push(values.map(String).join(" "));

  try {
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);
    const opened = await client.callTool({
      name: "open_workspace",
      arguments: { path: project },
    });
    const workspaceId = String((opened.structuredContent as Record<string, unknown>).workspaceId);

    output.length = 0;
    await client.callTool({
      name: "read",
      arguments: { workspaceId, path: "sample.txt" },
    });
    const readLog = stripVTControlCharacters(output.join("\n"));
    assert.match(readLog, /DEBUG │ tool_debug/);
    assert.match(readLog, /Read sample\.txt/);
    assert.match(readLog, /before/);

    output.length = 0;
    const command = `${JSON.stringify(process.execPath)} -e "console.log('exec-result')"`;
    await client.callTool({
      name: "exec_command",
      arguments: { workspaceId, cmd: command, yieldTimeMs: 2_000 },
    });
    const commandLog = stripVTControlCharacters(output.join("\n"));
    assert.match(commandLog, new RegExp(`\\$ ${escapeRegExp(command)}`));
    assert.match(commandLog, /exec-result/);
    assert.match(commandLog, /Process exited with code 0/);

    output.length = 0;
    await client.callTool({
      name: "apply_patch",
      arguments: {
        workspaceId,
        patch: [
          "*** Begin Patch",
          "*** Update File: sample.txt",
          "@@",
          "-before",
          "+after",
          "*** End Patch",
        ].join("\n"),
      },
    });
    const patchLog = stripVTControlCharacters(output.join("\n"));
    assert.match(patchLog, /Apply patch \[files=1, additions=1, removals=1\]/);
    assert.match(patchLog, /@@ -1(?:,1)? \+1(?:,1)? @@/);
    assert.match(patchLog, /-before/);
    assert.match(patchLog, /\+after/);
  } finally {
    console.log = originalLog;
    await client.close();
    await server.close();
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
