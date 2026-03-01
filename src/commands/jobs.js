import { pollUntil } from "../lib/polling.js";

export async function getJobStatus(backendClient, jobId) {
  return backendClient.getJob(jobId);
}

export async function pollJobStatus(
  backendClient,
  jobId,
  { intervalMs = 2_000, timeoutMs = 120_000, onTick } = {},
) {
  return pollUntil({
    getValue: () => backendClient.getJob(jobId),
    isDone: (job) => ["completed", "failed"].includes(String(job.status)),
    intervalMs,
    timeoutMs,
    onTick,
  });
}
