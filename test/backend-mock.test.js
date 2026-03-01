import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { MockBackendClient } from "../src/lib/backend-client/mock-client.js";
import { pollUntil } from "../src/lib/polling.js";

const fixtureHarPath = path.resolve("./test/fixtures/sample.har");

function createMockClient() {
  const dir = mkdtempSync(path.join(tmpdir(), "grabbit-mock-test-"));
  return new MockBackendClient({
    token: "mock_token",
    mockDbPath: path.join(dir, "mock-db.json"),
  });
}

test("mock compile lifecycle reaches completed and returns workflow id", async () => {
  const client = createMockClient();
  const submit = await client.submitCompile({
    harPath: fixtureHarPath,
    context: {
      goal: "Get stock price",
      matchers: [{ type: "output", value: "price" }],
      inputs: [],
      outputs: [{ name: "price" }],
      navigation_log: [],
    },
  });

  const finalJob = await pollUntil({
    getValue: () => client.getJob(submit.job_id),
    isDone: (job) => job.status === "completed",
    intervalMs: 200,
    timeoutMs: 7000,
  });

  assert.equal(finalJob.status, "completed");
  assert.ok(finalJob.workflow_id);
});

test("mock async run lifecycle reaches completed with output", async () => {
  const client = createMockClient();

  const submission = await client.submitCompile({
    harPath: fixtureHarPath,
    context: {
      goal: "Get stock price",
      matchers: [{ type: "output", value: "price" }],
      inputs: [{ name: "symbol", required: true }],
      outputs: [{ name: "price" }],
      navigation_log: [],
    },
  });

  const completedJob = await pollUntil({
    getValue: () => client.getJob(submission.job_id),
    isDone: (job) => job.status === "completed",
    intervalMs: 200,
    timeoutMs: 7000,
  });

  const asyncRun = await client.runWorkflow(completedJob.workflow_id, { symbol: "AAPL" }, { async: true });
  const completedRun = await pollUntil({
    getValue: () => client.getRun(asyncRun.run_id),
    isDone: (run) => run.status === "completed",
    intervalMs: 200,
    timeoutMs: 7000,
  });

  assert.equal(completedRun.status, "completed");
  assert.equal(completedRun.output.received_input.symbol, "AAPL");
});
