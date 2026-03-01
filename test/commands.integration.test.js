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
    takeStdout: () => out.join(""),
    takeStderr: () => err.join(""),
  };
}

function createEnv() {
  const dir = mkdtempSync(path.join(tmpdir(), "grabbit-integration-test-"));
  return {
    GRABBIT_CONFIG_PATH: path.join(dir, "config.json"),
    GRABBIT_MOCK_DB_PATH: path.join(dir, "mock-db.json"),
  };
}

const fixtureHarPath = path.resolve("./test/fixtures/sample.har");

test("mock end-to-end flow: login -> compile -> workflow -> run", async () => {
  const env = createEnv();

  {
    const buffers = createBuffers();
    const code = await executeCli(
      ["account", "login", "--token", "mock_token_abc", "--backend-mode", "mock", "--json"],
      { ...buffers, env },
    );
    assert.equal(code, 0);
    const payload = JSON.parse(buffers.takeStdout());
    assert.equal(payload.loggedIn, true);
  }

  let workflowId;
  {
    const buffers = createBuffers();
    const code = await executeCli(
      [
        "compile",
        "--har",
        fixtureHarPath,
        "--goal",
        "Get stock price from Yahoo Finance",
        "--matcher",
        "output:price",
        "--wait",
        "--interval",
        "200",
        "--timeout",
        "7000",
        "--json",
      ],
      { ...buffers, env },
    );
    assert.equal(code, 0);
    const payload = JSON.parse(buffers.takeStdout());
    assert.equal(payload.job.status, "completed");
    assert.ok(payload.job.workflow_id);
    workflowId = payload.job.workflow_id;
  }

  {
    const buffers = createBuffers();
    const code = await executeCli(["workflows", "get", workflowId, "--json"], {
      ...buffers,
      env,
    });
    assert.equal(code, 0);
    const payload = JSON.parse(buffers.takeStdout());
    assert.equal(payload.workflow_id, workflowId);
    assert.equal(payload.status, "completed");
  }

  {
    const buffers = createBuffers();
    const code = await executeCli(
      ["run", workflowId, "--input-json", "{\"symbol\":\"AAPL\"}", "--json"],
      {
        ...buffers,
        env,
      },
    );
    assert.equal(code, 0);
    const payload = JSON.parse(buffers.takeStdout());
    assert.equal(payload.run.status, "completed");
    assert.equal(payload.run.output.received_input.symbol, "AAPL");
  }
});
