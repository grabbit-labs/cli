import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";

import { CliError } from "../errors.js";

const DEFAULT_DB_PATH = path.join(homedir(), ".grabbit", "mock-db.json");
const JOB_PENDING_MS = 1_000;
const JOB_PROCESSING_MS = 2_000;
const RUN_PENDING_MS = 900;
const RUN_RUNNING_MS = 1_500;

function now() {
  return Date.now();
}

function nowIso() {
  return new Date().toISOString();
}

function ensureParentDir(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function safeReadJson(filePath) {
  try {
    const raw = readFileSync(filePath, "utf8");
    if (!raw.trim()) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function defaultDb() {
  return {
    jobs: {},
    workflows: {},
    runs: {},
    auth: {
      tokens: {},
    },
  };
}

function loadDb(dbPath) {
  if (!existsSync(dbPath)) {
    return defaultDb();
  }

  const parsed = safeReadJson(dbPath);
  return parsed ?? defaultDb();
}

function saveDb(dbPath, db) {
  ensureParentDir(dbPath);
  writeFileSync(dbPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

function inferDomain(context) {
  const firstUrl = context.navigation_log.find((item) => item.url)?.url;
  if (!firstUrl) {
    return "unknown";
  }

  try {
    return new URL(firstUrl).hostname;
  } catch {
    return "unknown";
  }
}

function toInputSchema(inputs) {
  const properties = {};
  const required = [];

  for (const input of inputs) {
    properties[input.name] = {
      type: "string",
      ...(input.example ? { example: input.example } : {}),
    };
    if (input.required) {
      required.push(input.name);
    }
  }

  return {
    type: "object",
    properties,
    required,
  };
}

function toOutputSchema(outputs) {
  const properties = {};
  for (const output of outputs) {
    properties[output.name] = {
      type: "string",
      ...(output.example_value ? { example_value: output.example_value } : {}),
    };
  }

  return {
    type: "object",
    properties,
  };
}

function buildRunOutput(workflow, inputPayload) {
  const output = {
    workflow_id: workflow.workflow_id,
    status: "completed",
    received_input: inputPayload,
    generated_at: nowIso(),
  };

  for (const key of Object.keys(workflow.output_schema?.properties ?? {})) {
    output[key] = `mock_${key}_value`;
  }

  return output;
}

function ensureAuth(token) {
  if (!token) {
    throw new CliError(
      "You are not logged in. Run `grabbit account login --token <token>` before calling backend commands.",
      { code: "NOT_AUTHENTICATED", exitCode: 1 },
    );
  }
}

export class MockBackendClient {
  constructor(config = {}) {
    this.token = config.token;
    this.dbPath = path.resolve(config.mockDbPath ?? DEFAULT_DB_PATH);
  }

  withDb(fn) {
    const db = loadDb(this.dbPath);
    const result = fn(db);
    saveDb(this.dbPath, db);
    return result;
  }

  advanceJob(job, db) {
    const currentTime = now();
    if (job.status === "completed" || job.status === "failed") {
      return;
    }

    if (job.status === "pending" && currentTime >= job.next_transition_at) {
      job.status = "processing";
      job.updated_at = nowIso();
      job.next_transition_at = currentTime + JOB_PROCESSING_MS;
      return;
    }

    if (job.status === "processing" && currentTime >= job.next_transition_at) {
      const workflowId = randomUUID();
      const workflow = {
        workflow_id: workflowId,
        status: "completed",
        domain: inferDomain(job.context),
        input_schema: toInputSchema(job.context.inputs),
        output_schema: toOutputSchema(job.context.outputs),
        stats: {
          matcher_count: job.context.matchers.length,
          navigation_steps: job.context.navigation_log.length,
          har_bytes: job.har_bytes,
        },
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      db.workflows[workflowId] = workflow;

      job.status = "completed";
      job.workflow_id = workflowId;
      job.updated_at = nowIso();
      job.next_transition_at = null;
    }
  }

  advanceRun(run, db) {
    const currentTime = now();
    if (run.status === "completed" || run.status === "failed") {
      return;
    }

    if (run.status === "pending" && currentTime >= run.next_transition_at) {
      run.status = "running";
      run.updated_at = nowIso();
      run.next_transition_at = currentTime + RUN_RUNNING_MS;
      return;
    }

    if (run.status === "running" && currentTime >= run.next_transition_at) {
      const workflow = db.workflows[run.workflow_id];
      run.status = "completed";
      run.output = buildRunOutput(workflow, run.input);
      run.updated_at = nowIso();
      run.next_transition_at = null;
    }
  }

  async validateAuth(token) {
    const effectiveToken = token ?? this.token;
    return this.withDb((db) => {
      if (effectiveToken) {
        db.auth.tokens[effectiveToken] = {
          last_seen_at: nowIso(),
        };
      }
      return {
        valid: Boolean(effectiveToken),
        mode: "mock",
        user_id: effectiveToken ? "mock-user" : null,
      };
    });
  }

  async submitCompile({ harPath, context }) {
    ensureAuth(this.token);

    if (!existsSync(harPath)) {
      throw new CliError(`HAR file not found: ${harPath}`, { code: "HAR_NOT_FOUND" });
    }

    const harStats = statSync(harPath);

    return this.withDb((db) => {
      const jobId = randomUUID();
      db.jobs[jobId] = {
        job_id: jobId,
        status: "pending",
        status_url: `/v1/jobs/${jobId}`,
        workflow_id: null,
        error: null,
        created_at: nowIso(),
        updated_at: nowIso(),
        next_transition_at: now() + JOB_PENDING_MS,
        har_path: harPath,
        har_bytes: harStats.size,
        context,
      };

      return {
        job_id: jobId,
        status: "pending",
        status_url: `/v1/jobs/${jobId}`,
      };
    });
  }

  async getJob(jobId) {
    ensureAuth(this.token);

    return this.withDb((db) => {
      const job = db.jobs[jobId];
      if (!job) {
        throw new CliError(`Job not found: ${jobId}`, { code: "JOB_NOT_FOUND", exitCode: 1 });
      }

      this.advanceJob(job, db);

      return {
        job_id: job.job_id,
        status: job.status,
        status_url: job.status_url,
        workflow_id: job.workflow_id,
        error: job.error,
        updated_at: job.updated_at,
      };
    });
  }

  async getWorkflow(workflowId) {
    ensureAuth(this.token);

    return this.withDb((db) => {
      const workflow = db.workflows[workflowId];
      if (!workflow) {
        throw new CliError(`Workflow not found: ${workflowId}`, {
          code: "WORKFLOW_NOT_FOUND",
          exitCode: 1,
        });
      }
      return workflow;
    });
  }

  async runWorkflow(workflowId, inputPayload = {}, options = {}) {
    ensureAuth(this.token);

    return this.withDb((db) => {
      const workflow = db.workflows[workflowId];
      if (!workflow) {
        throw new CliError(`Workflow not found: ${workflowId}`, {
          code: "WORKFLOW_NOT_FOUND",
          exitCode: 1,
        });
      }

      if (options.async) {
        const runId = randomUUID();
        db.runs[runId] = {
          run_id: runId,
          workflow_id: workflowId,
          status: "pending",
          input: inputPayload,
          output: null,
          created_at: nowIso(),
          updated_at: nowIso(),
          next_transition_at: now() + RUN_PENDING_MS,
          status_url: `/v1/runs/${runId}`,
        };

        return {
          run_id: runId,
          status: "pending",
          status_url: `/v1/runs/${runId}`,
        };
      }

      return {
        status: "completed",
        workflow_id: workflowId,
        output: buildRunOutput(workflow, inputPayload),
      };
    });
  }

  async getRun(runId) {
    ensureAuth(this.token);

    return this.withDb((db) => {
      const run = db.runs[runId];
      if (!run) {
        throw new CliError(`Run not found: ${runId}`, { code: "RUN_NOT_FOUND", exitCode: 1 });
      }

      this.advanceRun(run, db);

      return {
        run_id: run.run_id,
        workflow_id: run.workflow_id,
        status: run.status,
        output: run.output,
        status_url: run.status_url,
        updated_at: run.updated_at,
      };
    });
  }
}
