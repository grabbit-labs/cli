import { CliError } from "./errors.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollUntil({
  getValue,
  isDone,
  intervalMs = 2_000,
  timeoutMs = 120_000,
  onTick,
}) {
  const startedAt = Date.now();
  let latestValue = null;

  while (Date.now() - startedAt <= timeoutMs) {
    latestValue = await getValue();

    if (typeof onTick === "function") {
      await onTick(latestValue);
    }

    if (isDone(latestValue)) {
      return latestValue;
    }

    await sleep(intervalMs);
  }

  throw new CliError(`Polling timed out after ${timeoutMs}ms`, {
    code: "POLL_TIMEOUT",
    details: { latest: latestValue },
  });
}
