import { type DevspaceUserConfig, writeDevspaceConfig } from "../user-config.js";

interface TestConfigOverrides {
  server?: {
    host?: string;
    port?: number;
    publicBaseUrl?: string;
    allowedHosts?: string[];
  };
  workspaces?: {
    allowedRoots?: string[];
    worktreeRoot?: string;
  };
  storage?: {
    stateDir?: string;
  };
  artifacts?: {
    enabled?: boolean;
    maxFileBytes?: number;
  };
  oauth?: {
    allowedRedirectHosts?: string[];
    allowedResourceUrls?: string[];
  };
  logging?: {
    level?: string;
  };
}

export function writeTestDevspaceConfig(
  configDir: string,
  overrides: TestConfigOverrides = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    DEVSPACE_CONFIG_DIR: configDir,
    DEVSPACE_OAUTH_OWNER_TOKEN: "test-owner-token-that-is-long-enough",
  };
  const config: DevspaceUserConfig = {
    host: overrides.server?.host,
    port: overrides.server?.port,
    publicBaseUrl: overrides.server?.publicBaseUrl,
    allowedHosts: overrides.server?.allowedHosts,
    allowedRoots: overrides.workspaces?.allowedRoots,
    worktreeRoot: overrides.workspaces?.worktreeRoot,
    stateDir: overrides.storage?.stateDir,
    artifactsEnabled: overrides.artifacts?.enabled,
    artifactMaxFileBytes: overrides.artifacts?.maxFileBytes,
    oauth: overrides.oauth,
  };
  writeDevspaceConfig(config, env);
  if (overrides.logging?.level) env.DEVSPACE_LOG_LEVEL = overrides.logging.level;
  return env;
}
