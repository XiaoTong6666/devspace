# Configuration Reference

DevSpace can be configured through `devspace init`, persisted config files, or
environment variables.

The default files are:

```text
~/.devspace/config.json
~/.devspace/auth.json
```

Use another config directory with:

```bash
DEVSPACE_CONFIG_DIR=/path/to/config npx @xiaotong6666/devspace serve
```

## Commands

```bash
npx @xiaotong6666/devspace init
npx @xiaotong6666/devspace serve
npx @xiaotong6666/devspace doctor
npx @xiaotong6666/devspace config get
npx @xiaotong6666/devspace config set publicBaseUrl https://devspace.example.com
npx @xiaotong6666/devspace share ./path/to/file.bin
```

## Core Environment Variables

| Variable | Purpose |
| --- | --- |
| `HOST` | Local bind host. Defaults to `127.0.0.1`. |
| `PORT` | Local port. Defaults to `7676`. |
| `DEVSPACE_ALLOWED_ROOTS` | Comma-separated local roots that workspaces may open. |
| `DEVSPACE_PUBLIC_BASE_URL` | Public origin for the server, without `/mcp`. |
| `DEVSPACE_ALLOWED_HOSTS` | Optional Host header allowlist override. |
| `DEVSPACE_OAUTH_OWNER_TOKEN` | Owner password for OAuth approval. Must be at least 16 characters. |
| `DEVSPACE_WORKTREE_ROOT` | Directory for managed Git worktrees. Defaults to `~/.devspace/worktrees`. |
| `DEVSPACE_STATE_DIR` | Directory for SQLite state. Defaults to `~/.local/share/devspace`. |

## Native Artifact Download

Native-file download is disabled by default. Enable it when ChatGPT needs to hand
an attached or generated file into an already-open workspace:

```bash
DEVSPACE_ARTIFACTS=1 npx @xiaotong6666/devspace serve
```

This feature currently supports Linux. It is not registered on macOS, Windows,
or BSD because the secure publication path depends on traversable,
descriptor-anchored directory paths provided by Linux procfs.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DEVSPACE_ARTIFACTS` | `0` | Expose `download_artifact` for trusted native files. |
| `DEVSPACE_ARTIFACT_MAX_FILE_BYTES` | `104857600` | Maximum streamed size of one file (100 MiB). |

The same settings may be persisted in `~/.devspace/config.json` as
`artifactsEnabled` and `artifactMaxFileBytes`.

`download_artifact` accepts the native file object supplied by the MCP connector,
a `workspaceId` returned by `open_workspace`, and a relative workspace `path`.
DevSpace safely creates missing parent directories, refuses to overwrite an
existing destination, and returns only the normalized workspace-relative path.
It does not accept conflict modes, expected hashes, arbitrary URL strings, local
paths, embedded credentials, or extra object fields.

There is no artifact root, total quota, TTL, pinning, persistent database record,
or background artifact cleanup service. See [Native File Download](artifact-exchange.md)
for the supported connector shape and security boundaries.

## Temporary Outbound File Sharing

Temporary outbound file sharing is an optional feature. It is disabled by
default and is not required for normal workspace, filesystem, shell, Git,
artifact-download, or review operations. When disabled, DevSpace does not
expose the `share_file` MCP tool, invoke Wrangler, or require Cloudflare
credentials.

When explicitly configured, DevSpace can publish a local workspace file to a temporary public
Cloudflare R2 bucket. This is useful when an MCP host such as ChatGPT needs the
actual bytes of a local image, PDF, archive, media file, or other binary file and
cannot access the local filesystem path directly.

When configured, DevSpace exposes a `share_file` MCP tool and a matching CLI:

```bash
devspace share ./build/result.pdf
```

The CLI prints only the public URL on success, which makes it easy to paste or
pipe elsewhere. `share_file` returns the URL plus object metadata to the MCP
host. Files must resolve inside the active workspace root for the MCP tool, and
inside one of `DEVSPACE_ALLOWED_ROOTS` for the CLI. Symlinks that resolve outside
those roots are rejected.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DEVSPACE_FILE_SHARE_BUCKET` | unset | Cloudflare R2 bucket used for uploads. |
| `DEVSPACE_FILE_SHARE_BASE_URL` | unset | Public origin for objects, typically the bucket's `r2.dev` URL or a custom domain. |
| `DEVSPACE_FILE_SHARE_WRANGLER_AUTH` | `inherit` | `inherit` passes Cloudflare auth environment variables through. `oauth` removes API token/key env vars so Wrangler uses its stored OAuth login. |
| `DEVSPACE_FILE_SHARE_MAX_FILE_BYTES` | `104857600` | Maximum size of one shared file (100 MiB). |

The equivalent persisted configuration is:

```json
{
  "fileShare": {
    "bucket": "devspace-transfer",
    "publicBaseUrl": "https://pub-example.r2.dev",
    "wranglerAuth": "oauth",
    "maxFileBytes": 104857600
  }
}
```

The optional feature requires a locally installed `wrangler` CLI plus either
Cloudflare API credentials or an existing Wrangler OAuth login. DevSpace invokes
the local `wrangler r2 object put ... --remote` command and
generates an opaque object key containing a UUID. It infers common MIME types
from the filename and otherwise uses `application/octet-stream`.

The returned URL is public. Expiration and deletion are owned by the configured
R2 bucket, not by DevSpace, so configure an R2 lifecycle rule appropriate for
your use case. Do not use public file sharing for secrets unless that exposure is
explicitly intended.

## OAuth

DevSpace uses a single-user OAuth approval flow.

| Variable | Default |
| --- | --- |
| `DEVSPACE_OAUTH_ACCESS_TOKEN_TTL_SECONDS` | `3600` |
| `DEVSPACE_OAUTH_REFRESH_TOKEN_TTL_SECONDS` | `2592000` |
| `DEVSPACE_OAUTH_SCOPES` | `devspace` |
| `DEVSPACE_OAUTH_ALLOWED_REDIRECT_HOSTS` | `chatgpt.com,oauth-redirect-sandbox.googleusercontent.com,oauth-redirect-test.googleusercontent.com,oauth-redirect.googleusercontent.com,localhost,127.0.0.1` |

MCP clients discover metadata from:

```text
/.well-known/oauth-protected-resource/mcp
/.well-known/oauth-authorization-server
```

## Tool Surface

DevSpace exposes one native coding tool surface: `open_workspace`,
`refresh_workspace_context`, `read`, `grep`, `glob`, `ls`, `apply_patch`,
`exec_command`, `write_stdin`, `list_processes`, and `terminate_process`.

The former `minimal` and `full` modes and their `DEVSPACE_TOOL_MODE` and
`DEVSPACE_MINIMAL_TOOLS` settings have been removed. Delete either setting from
an existing configuration before starting DevSpace; startup rejects them with a
migration error instead of silently changing the exposed tools.

Native-mode commands run without a PTY by default. Set `tty: true` on
`exec_command` for interactive terminal programs. PTY support uses the optional
`node-pty` dependency; `write_stdin` can send input, poll output, and resize PTY
sessions. Commands may create, modify, move, rename, or delete workspace files.
They run with the authority of the local operating-system user and are not an
OS sandbox.

Every `exec_command` response includes a session ID. Running and completed
sessions can be rediscovered with `list_processes`; completed sessions remain
available for five minutes. `terminate_process` requests SIGTERM and is safe to
repeat for a retained completed session. Process sessions are memory-resident
and do not survive a DevSpace server restart. `yieldTimeMs` is capped at 30
seconds per call; a process can continue beyond that window and be polled.

Workspace instruction and activated-skill content is persisted as an accepted
context revision. Mutating tools reject changed active context, and applicable
nested instruction files must be read in full before operations under their
directories. `refresh_workspace_context` accepts the current filesystem state
and returns the full context plus changes from the previous revision.

## Widgets

`DEVSPACE_WIDGETS` controls ChatGPT Apps iframe usage.

| Value | Behavior |
| --- | --- |
| `changes` | Default. Ordinary coding tools stay data-only. Widget UI is attached only to `open_workspace`, `refresh_workspace_context`, and the aggregate `show_changes` checkpoint tool. |
| `full` | Opt-in diagnostic mode. Widget UI is attached to exposed workspace, file, edit, search, directory, and shell tools. This can create many iframe-backed cards in long ChatGPT conversations. |
| `off` | Disables widget UI. |

## Skills

| Variable | Purpose |
| --- | --- |
| `DEVSPACE_SKILLS` | Set to `0` to hide skills. Enabled by default. |
| `DEVSPACE_AGENT_DIR` | Defaults to `~/.codex`; its `skills` child is loaded for compatibility. |
| `DEVSPACE_SKILL_PATHS` | Optional comma-separated additional skill directories. |

DevSpace discovers standard Agent Skills from:

- `~/.agents/skills`
- project `.agents/skills`
- `~/.devspace/skills`

It also keeps compatibility with:

- `DEVSPACE_AGENT_DIR/skills`, defaulting to `~/.codex/skills`
- additional paths from `DEVSPACE_SKILL_PATHS`

Legacy project paths such as `.pi/skills` can be added through `DEVSPACE_SKILL_PATHS` when needed.

Example:

```bash
DEVSPACE_SKILL_PATHS="$HOME/.claude/skills,$HOME/company/skills" \
npx @xiaotong6666/devspace serve
```

## Logging

| Variable | Default |
| --- | --- |
| `DEVSPACE_LOG_LEVEL` | `info` |
| `DEVSPACE_LOG_FORMAT` | `json` normally; `pretty` when `DEVSPACE_LOG_LEVEL=debug` |
| `DEVSPACE_LOG_REQUESTS` | `1` |
| `DEVSPACE_LOG_ASSETS` | `0` |
| `DEVSPACE_LOG_TOOL_CALLS` | `1` |
| `DEVSPACE_LOG_SHELL_COMMANDS` | `0` |
| `DEVSPACE_TRUST_PROXY` | `0` |

Debug logging prints OpenCode-style tool transcripts for shell commands,
Read, Grep, Glob, List, and apply_patch. Shell transcripts include the complete
command and returned process output. Patch transcripts include unified diff
hunks with line ranges and every added or removed line. Set
`DEVSPACE_LOG_FORMAT=json` explicitly when structured debug logs are required.
Pretty logs use terminal colors automatically. Set `NO_COLOR=1` to disable
colors or `FORCE_COLOR=1` to preserve them when output is not attached to a TTY.

Set `DEVSPACE_LOG_SHELL_COMMANDS=1` only when you intentionally want command
previews in non-debug `tool_call` logs. Debug transcripts always contain the
complete command and tool output, which may include sensitive data; enable them
only while actively diagnosing a trusted local environment.

## Env-Only Example

```bash
DEVSPACE_OAUTH_OWNER_TOKEN="$(openssl rand -base64 32)" \
DEVSPACE_ALLOWED_ROOTS="$HOME/personal,$HOME/work" \
DEVSPACE_PUBLIC_BASE_URL="https://devspace.example.com" \
DEVSPACE_WORKTREE_ROOT="$HOME/.devspace/worktrees" \
DEVSPACE_ARTIFACTS="1" \
DEVSPACE_WIDGETS="changes" \
npx @xiaotong6666/devspace serve
```

The environment assignments must be part of the same command invocation, or
exported first.
