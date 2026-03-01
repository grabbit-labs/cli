import { readFileSync } from "node:fs";
import path from "node:path";

import {
  parseContextEnvelope,
  parseInputSpec,
  parseMatcherSpec,
  parseNavigationSpec,
  parseOutputSpec,
} from "../lib/context-schema.js";
import { CliError } from "../lib/errors.js";
import { resolveHarFile } from "../lib/har-utils.js";
import { pollUntil } from "../lib/polling.js";

function parseJsonFile(filePath) {
  try {
    const raw = readFileSync(path.resolve(filePath), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    throw new CliError(`Failed to read JSON file at ${filePath}: ${error.message}`, {
      code: "INVALID_JSON_FILE",
    });
  }
}

function maybeArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function buildCompileContextFromOptions(options, extra = {}) {
  const workflowName = extra.workflowName;
  const contextFile = options.contextFile;

  let baseContext = {};
  if (contextFile) {
    baseContext = parseJsonFile(contextFile);
  }

  const goal = options.goal ?? baseContext.goal ?? (workflowName ? `Save workflow: ${workflowName}` : undefined);
  const matcherSpecs = [...maybeArray(baseContext.matchers), ...maybeArray(options.matcher)];

  const parsedMatchers = matcherSpecs.map((entry) =>
    typeof entry === "string" ? parseMatcherSpec(entry) : parseMatcherSpec(`${entry.type}:${entry.value}`),
  );

  const fallbackMatchers =
    parsedMatchers.length > 0
      ? parsedMatchers
      : workflowName
        ? [{ type: "output", value: workflowName }]
        : [];

  const parsedInputs = [
    ...maybeArray(baseContext.inputs).map((entry) =>
      typeof entry === "string"
        ? parseInputSpec(entry)
        : { name: entry.name, example: entry.example, required: entry.required },
    ),
    ...maybeArray(options.input).map(parseInputSpec),
  ];

  const parsedOutputs = [
    ...maybeArray(baseContext.outputs).map((entry) =>
      typeof entry === "string"
        ? parseOutputSpec(entry)
        : { name: entry.name, example_value: entry.example_value },
    ),
    ...maybeArray(options.output).map(parseOutputSpec),
  ];

  const parsedNavigationLog = [
    ...maybeArray(baseContext.navigation_log).map((entry) =>
      typeof entry === "string" ? parseNavigationSpec(entry) : entry,
    ),
    ...maybeArray(options.navigation).map(parseNavigationSpec),
  ];

  const notes = options.notes ?? baseContext.notes ?? (workflowName ? `workflow_name=${workflowName}` : undefined);

  return parseContextEnvelope({
    goal,
    matchers: fallbackMatchers,
    inputs: parsedInputs,
    outputs: parsedOutputs,
    navigation_log: parsedNavigationLog,
    notes,
  });
}

export function parsePollingOption(value, fallback, fieldName) {
  if (value === undefined || value === null) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new CliError(`Invalid ${fieldName} value: ${value}. Expected a positive number.`, {
      code: "INVALID_POLL_OPTION",
    });
  }

  return parsed;
}

export async function submitCompileAndOptionallyWait({
  backendClient,
  options,
  workflowName,
  onPollTick,
}) {
  const context = buildCompileContextFromOptions(options, { workflowName });
  const har = resolveHarFile(options.har);
  const submission = await backendClient.submitCompile({
    harPath: har.path,
    context,
  });

  if (!options.wait) {
    return {
      submission,
      job: null,
      context,
      har,
    };
  }

  const intervalMs = parsePollingOption(options.interval, 2_000, "interval");
  const timeoutMs = parsePollingOption(options.timeout, 120_000, "timeout");

  const job = await pollUntil({
    getValue: () => backendClient.getJob(submission.job_id),
    isDone: (current) => ["completed", "failed"].includes(String(current.status)),
    intervalMs,
    timeoutMs,
    onTick: onPollTick,
  });

  return {
    submission,
    job,
    context,
    har,
  };
}
