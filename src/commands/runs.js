import { pollUntil } from "../lib/polling.js";

export async function runWorkflow(
  backendClient,
  workflowId,
  inputPayload,
  { async = false } = {},
) {
  return backendClient.runWorkflow(workflowId, inputPayload, { async });
}

export async function getRunStatus(backendClient, runId) {
  return backendClient.getRun(runId);
}

export async function pollRunStatus(
  backendClient,
  runId,
  { intervalMs = 2_000, timeoutMs = 120_000, onTick } = {},
) {
  return pollUntil({
    getValue: () => backendClient.getRun(runId),
    isDone: (run) => ["completed", "failed"].includes(String(run.status)),
    intervalMs,
    timeoutMs,
    onTick,
  });
}
