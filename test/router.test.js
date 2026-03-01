import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { executeCli } from "../src/cli/router.js";

function createBuffers() {
  const out = [];
  const err = [];
  return {
    stdout: { write: (chunk) => out.push(String(chunk)) },
    stderr: { write: (chunk) => err.push(String(chunk)) },
    getStdout: () => out.join(""),
    getStderr: () => err.join(""),
  };
}

function createEnv() {
  const dir = mkdtempSync(path.join(tmpdir(), "grabbit-router-test-"));
  return {
    GRABBIT_CONFIG_PATH: path.join(dir, "config.json"),
    GRABBIT_MOCK_DB_PATH: path.join(dir, "mock-db.json"),
  };
}

test("forwards non-native commands to agent-browser bridge", async () => {
  const calls = [];
  const code = await executeCli(["snapshot", "--help"], {
    forwarder: (args) => {
      calls.push(args);
      return 0;
    },
  });

  assert.equal(code, 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ["snapshot", "--help"]);
});

test("runs native command path for account status", async () => {
  const env = createEnv();
  const buffers = createBuffers();

  const code = await executeCli(["account", "status"], {
    ...buffers,
    env,
    forwarder: () => {
      throw new Error("Should not forward");
    },
  });

  assert.equal(code, 0);
  assert.match(buffers.getStdout(), /Logged in:/);
  assert.equal(buffers.getStderr(), "");
});

test("returns JSON error payload for native command failures", async () => {
  const env = createEnv();
  const buffers = createBuffers();

  const code = await executeCli(
    ["compile", "--goal", "Missing HAR", "--matcher", "output:price", "--json"],
    {
      ...buffers,
      env,
    },
  );

  assert.equal(code, 1);
  const parsedErr = JSON.parse(buffers.getStderr());
  assert.equal(parsedErr.code, "MISSING_HAR_FILE");
});
