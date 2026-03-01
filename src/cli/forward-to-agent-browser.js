import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

import { CliError } from "../lib/errors.js";

const require = createRequire(import.meta.url);

export function resolveAgentBrowserEntrypoint() {
  try {
    return require.resolve("agent-browser/bin/agent-browser.js");
  } catch {
    throw new CliError(
      "agent-browser is not available. Install dependencies or run `npm install -g agent-browser`.",
      {
        code: "AGENT_BROWSER_NOT_FOUND",
        exitCode: 1,
      },
    );
  }
}

export function forwardToAgentBrowser(args, options = {}) {
  const nodePath = options.nodePath ?? process.execPath;
  const spawnImpl = options.spawnImpl ?? spawnSync;
  const entrypoint = options.entrypoint ?? resolveAgentBrowserEntrypoint();
  const stdio = options.stdio ?? "inherit";

  const result = spawnImpl(nodePath, [entrypoint, ...args], {
    stdio,
    env: options.env ?? process.env,
  });

  if (result.error) {
    throw new CliError(`Failed to forward command to agent-browser: ${result.error.message}`, {
      code: "AGENT_BROWSER_FORWARD_FAILED",
    });
  }

  return result.status ?? 0;
}
