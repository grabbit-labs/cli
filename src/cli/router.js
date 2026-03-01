import { Command } from "commander";
import { readFileSync } from "node:fs";
import path from "node:path";

import { submitCompileAndOptionallyWait, parsePollingOption } from "../commands/compile.js";
import { getJobStatus, pollJobStatus } from "../commands/jobs.js";
import { getRunStatus, pollRunStatus, runWorkflow } from "../commands/runs.js";
import { getWorkflowDetails } from "../commands/workflows.js";
import { storeLogin, getLoginStatus, logout } from "../lib/auth-store.js";
import { createBackendClient } from "../lib/backend-client/index.js";
import { getRuntimeConfig, saveConfig } from "../lib/config-store.js";
import { CliError, toCliError } from "../lib/errors.js";
import { maskToken, printError, printJson, printText } from "../lib/output.js";
import { PARITY_NOTE, ROOT_DESCRIPTION, ROOT_EXAMPLES } from "./help.js";
import { forwardToAgentBrowser } from "./forward-to-agent-browser.js";

const CLI_VERSION = (() => {
  try {
    const packageJsonPath = new URL("../../package.json", import.meta.url);
    return JSON.parse(readFileSync(packageJsonPath, "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

const NATIVE_TOP_LEVEL_COMMANDS = new Set([
  "account",
  "compile",
  "config",
  "help",
  "jobs",
  "run",
  "runs",
  "save",
  "task",
  "version",
  "workflows",
]);

const ROOT_ONLY_FLAGS = new Set(["--help", "-h", "--version", "-V", "--json"]);

function firstPositional(args) {
  for (const arg of args) {
    if (!arg.startsWith("-")) {
      return arg;
    }
  }
  return null;
}

function shouldForwardToAgentBrowser(args) {
  if (!args.length) {
    return false;
  }

  const first = firstPositional(args);
  if (!first) {
    return args.some((arg) => !ROOT_ONLY_FLAGS.has(arg));
  }

  return !NATIVE_TOP_LEVEL_COMMANDS.has(first);
}

function parseJsonInput(raw, sourceLabel) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new CliError(`Invalid JSON in ${sourceLabel}: ${error.message}`, {
      code: "INVALID_JSON_INPUT",
    });
  }
}

function parseRunInputPayload(options) {
  if (options.inputJson && options.inputFile) {
    throw new CliError("Use either --input-json or --input-file, not both.", {
      code: "INVALID_RUN_INPUT_OPTIONS",
    });
  }

  if (options.inputJson) {
    return parseJsonInput(options.inputJson, "--input-json");
  }

  if (options.inputFile) {
    const filePath = path.resolve(options.inputFile);
    const raw = readFileSync(filePath, "utf8");
    return parseJsonInput(raw, filePath);
  }

  return {};
}

function getJsonFlag(command) {
  return Boolean(command.optsWithGlobals().json);
}

function buildBackendConfig(command, env) {
  const runtime = getRuntimeConfig({ env });
  const options = command.opts();

  return {
    ...runtime,
    backendMode: options.backendMode ?? runtime.backendMode,
    apiBaseUrl: options.apiUrl ?? runtime.apiBaseUrl,
    token: options.token ?? runtime.token,
  };
}

function emitAccountStatus(status, { json, stdout }) {
  if (json) {
    printJson(status, stdout);
    return;
  }

  const lines = [
    `Logged in: ${status.loggedIn ? "yes" : "no"}`,
    `Backend mode: ${status.backendMode}`,
    `API base URL: ${status.apiBaseUrl}`,
    `Token: ${status.tokenPreview ?? "not set"}`,
  ];
  printText(lines.join("\n"), stdout);
}

function emitCompileResult(result, { json, stdout }) {
  if (json) {
    printJson(result, stdout);
    return;
  }

  const lines = [
    `Compile job submitted.`,
    `Job ID: ${result.submission.job_id}`,
    `Status: ${result.submission.status}`,
    `Status URL: ${result.submission.status_url}`,
  ];

  if (result.job) {
    lines.push("");
    lines.push(`Final job status: ${result.job.status}`);
    if (result.job.workflow_id) {
      lines.push(`Workflow ID: ${result.job.workflow_id}`);
    }
  } else {
    lines.push("");
    lines.push(`Next step: grabbit jobs poll ${result.submission.job_id}`);
  }

  printText(lines.join("\n"), stdout);
}

function emitRunResult(result, { json, stdout }) {
  if (json) {
    printJson(result, stdout);
    return;
  }

  if (result.run && result.run.run_id) {
    const lines = [
      `Run submitted.`,
      `Run ID: ${result.run.run_id}`,
      `Status: ${result.run.status}`,
      "",
      `Next step: grabbit runs poll ${result.run.run_id}`,
    ];

    if (result.finalRun) {
      lines.push("");
      lines.push(`Final run status: ${result.finalRun.status}`);
      if (result.finalRun.output) {
        lines.push(`Output: ${JSON.stringify(result.finalRun.output)}`);
      }
    }

    printText(lines.join("\n"), stdout);
    return;
  }

  printText(`Run completed.\nOutput: ${JSON.stringify(result.run.output ?? result.run)}`, stdout);
}

function createStatusTicker(labelPrefix, stdout) {
  let previousStatus = null;
  return (entity) => {
    const current = String(entity.status ?? "");
    if (current !== previousStatus) {
      previousStatus = current;
      const id = entity.job_id ?? entity.run_id ?? "unknown";
      printText(`${labelPrefix} ${id}: ${current}`, stdout);
    }
  };
}

function configureBackendOptions(command) {
  command
    .option("--backend-mode <mode>", "Backend mode: mock or live")
    .option("--api-url <url>", "Override API base URL for this command");
}

async function runNativeCli(args, dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const stdout = dependencies.stdout ?? process.stdout;
  const stderr = dependencies.stderr ?? process.stderr;
  const backendFactory = dependencies.backendFactory ?? createBackendClient;

  const program = new Command();
  program
    .name("grabbit")
    .description(ROOT_DESCRIPTION)
    .version(CLI_VERSION, "-V, --version", "display CLI version")
    .addHelpText("after", `\n${PARITY_NOTE}\n${ROOT_EXAMPLES}`)
    .option("--json", "Output machine-readable JSON for Grabbit-native commands");

  program.showHelpAfterError();
  program.exitOverride();

  program
    .command("version")
    .description("Show CLI version")
    .action(() => {
      printText(CLI_VERSION, stdout);
    });

  const account = program.command("account").description("Authentication commands");

  account
    .command("login")
    .description("Store an auth token for backend calls")
    .requiredOption("--token <token>", "Auth token issued by Grabbit")
    .option("--api-url <url>", "Set and store API base URL")
    .option("--backend-mode <mode>", "Set and store backend mode (mock/live)")
    .option("--validate", "Validate token with backend endpoint")
    .action(async (options, command) => {
      const json = getJsonFlag(command);
      const runtime = getRuntimeConfig({ env });
      const apiBaseUrl = options.apiUrl ?? runtime.apiBaseUrl;
      const backendMode = options.backendMode ?? runtime.backendMode;

      if (options.validate) {
        const client = backendFactory({
          ...runtime,
          apiBaseUrl,
          backendMode,
          token: options.token,
        });
        const validation = await client.validateAuth(options.token);
        if (validation.valid === false) {
          throw new CliError("Authentication token was rejected by backend validation.", {
            code: "AUTH_VALIDATION_FAILED",
          });
        }
      }

      const stored = storeLogin(
        {
          token: options.token,
          apiBaseUrl,
          backendMode,
        },
        { env },
      );

      const payload = {
        success: true,
        loggedIn: true,
        backendMode: stored.backendMode,
        apiBaseUrl: stored.apiBaseUrl,
        tokenPreview: maskToken(options.token),
      };

      if (json) {
        printJson(payload, stdout);
      } else {
        printText(
          [
            "Login saved.",
            `Backend mode: ${payload.backendMode}`,
            `API base URL: ${payload.apiBaseUrl}`,
            `Token: ${payload.tokenPreview}`,
          ].join("\n"),
          stdout,
        );
      }
    });

  account
    .command("status")
    .description("Show current auth status")
    .action((_, command) => {
      const json = getJsonFlag(command);
      const status = getLoginStatus({ env });
      emitAccountStatus(status, { json, stdout });
    });

  account
    .command("logout")
    .description("Remove stored auth token")
    .action((_, command) => {
      const json = getJsonFlag(command);
      const status = logout({ env });
      if (json) {
        printJson({ success: true, ...status }, stdout);
      } else {
        printText("Logged out. Stored token removed.", stdout);
      }
    });

  const config = program.command("config").description("Manage local CLI config");

  config
    .command("get [key]")
    .description("Read resolved configuration")
    .action((key, command) => {
      const json = getJsonFlag(command);
      const runtime = getRuntimeConfig({ env });
      const value = key ? runtime[key] : runtime;

      if (json) {
        printJson(key ? { key, value } : runtime, stdout);
        return;
      }

      if (key) {
        printText(`${key}=${value ?? ""}`, stdout);
        return;
      }

      emitAccountStatus(getLoginStatus({ env }), { json: false, stdout });
    });

  config
    .command("set <key> <value>")
    .description("Update local CLI config")
    .action((key, value, command) => {
      const json = getJsonFlag(command);
      const stored = saveConfig({ [key]: value }, { env });

      if (json) {
        printJson({ success: true, key, value: stored[key] }, stdout);
      } else {
        printText(`Saved ${key}=${stored[key]}`, stdout);
      }
    });

  const compile = program
    .command("compile")
    .description("Submit a HAR + context to compile a reusable workflow")
    .option("--har <path>", "Path to HAR file from recorded session")
    .option("--goal <text>", "Goal description")
    .option("--matcher <type:value>", "Matcher (repeatable)", (value, list = []) => {
      list.push(value);
      return list;
    })
    .option("--input <spec>", "Input schema item name[:example][:required]", (value, list = []) => {
      list.push(value);
      return list;
    })
    .option("--output <spec>", "Output schema item name[:example_value]", (value, list = []) => {
      list.push(value);
      return list;
    })
    .option("--navigation <spec>", "Navigation step action[:url][:value][:selector] (or action|url|value|selector)", (value, list = []) => {
      list.push(value);
      return list;
    })
    .option("--notes <text>", "Optional notes")
    .option("--context-file <path>", "Path to JSON context payload")
    .option("--wait", "Poll until compile job reaches terminal state")
    .option("--interval <ms>", "Polling interval in milliseconds", "2000")
    .option("--timeout <ms>", "Polling timeout in milliseconds", "120000");
  configureBackendOptions(compile);

  compile.action(async (options, command) => {
    const json = getJsonFlag(command);
    const backendConfig = buildBackendConfig(command, env);
    const backendClient = backendFactory(backendConfig);

    const result = await submitCompileAndOptionallyWait({
      backendClient,
      options,
      onPollTick: json ? undefined : createStatusTicker("Job", stdout),
    });

    emitCompileResult(result, { json, stdout });
  });

  const save = program
    .command("save <workflowName>")
    .description("Friendly alias for compile, using a workflow name")
    .requiredOption("--har <path>", "Path to HAR file from recorded session")
    .option("--goal <text>", "Goal description (defaults from workflow name)")
    .option("--matcher <type:value>", "Matcher (repeatable)", (value, list = []) => {
      list.push(value);
      return list;
    })
    .option("--input <spec>", "Input schema item name[:example][:required]", (value, list = []) => {
      list.push(value);
      return list;
    })
    .option("--output <spec>", "Output schema item name[:example_value]", (value, list = []) => {
      list.push(value);
      return list;
    })
    .option("--navigation <spec>", "Navigation step action[:url][:value][:selector] (or action|url|value|selector)", (value, list = []) => {
      list.push(value);
      return list;
    })
    .option("--notes <text>", "Optional notes")
    .option("--context-file <path>", "Path to JSON context payload")
    .option("--wait", "Poll until compile job reaches terminal state")
    .option("--interval <ms>", "Polling interval in milliseconds", "2000")
    .option("--timeout <ms>", "Polling timeout in milliseconds", "120000");
  configureBackendOptions(save);

  save.action(async (workflowName, options, command) => {
    const json = getJsonFlag(command);
    const backendConfig = buildBackendConfig(command, env);
    const backendClient = backendFactory(backendConfig);

    const result = await submitCompileAndOptionallyWait({
      backendClient,
      options,
      workflowName,
      onPollTick: json ? undefined : createStatusTicker("Job", stdout),
    });

    emitCompileResult(result, { json, stdout });
  });

  const task = program.command("task").description("Task-oriented aliases around compile/jobs");
  const taskSubmit = task
    .command("submit")
    .description("Alias of compile")
    .requiredOption("--har <path>", "Path to HAR file from recorded session")
    .option("--workflow-name <name>", "Optional workflow name for metadata and defaults")
    .option("--goal <text>", "Goal description")
    .option("--matcher <type:value>", "Matcher (repeatable)", (value, list = []) => {
      list.push(value);
      return list;
    })
    .option("--input <spec>", "Input schema item name[:example][:required]", (value, list = []) => {
      list.push(value);
      return list;
    })
    .option("--output <spec>", "Output schema item name[:example_value]", (value, list = []) => {
      list.push(value);
      return list;
    })
    .option("--navigation <spec>", "Navigation step action[:url][:value][:selector] (or action|url|value|selector)", (value, list = []) => {
      list.push(value);
      return list;
    })
    .option("--notes <text>", "Optional notes")
    .option("--context-file <path>", "Path to JSON context payload")
    .option("--wait", "Poll until compile job reaches terminal state")
    .option("--interval <ms>", "Polling interval in milliseconds", "2000")
    .option("--timeout <ms>", "Polling timeout in milliseconds", "120000");
  configureBackendOptions(taskSubmit);

  taskSubmit.action(async (options, command) => {
    const json = getJsonFlag(command);
    const backendConfig = buildBackendConfig(command, env);
    const backendClient = backendFactory(backendConfig);

    const result = await submitCompileAndOptionallyWait({
      backendClient,
      options,
      workflowName: options.workflowName,
      onPollTick: json ? undefined : createStatusTicker("Job", stdout),
    });

    emitCompileResult(result, { json, stdout });
  });

  const jobs = program.command("jobs").description("Inspect compile jobs");
  const jobsGet = jobs.command("get <jobId>").description("Get compile job status");
  configureBackendOptions(jobsGet);
  jobsGet.action(async (jobId, options, command) => {
    const json = getJsonFlag(command);
    const backendClient = backendFactory(buildBackendConfig(command, env));
    const job = await getJobStatus(backendClient, jobId);

    if (json) {
      printJson(job, stdout);
    } else {
      printText(JSON.stringify(job, null, 2), stdout);
    }
  });

  const jobsPoll = jobs
    .command("poll <jobId>")
    .description("Poll compile job until completed/failed")
    .option("--interval <ms>", "Polling interval in milliseconds", "2000")
    .option("--timeout <ms>", "Polling timeout in milliseconds", "120000");
  configureBackendOptions(jobsPoll);
  jobsPoll.action(async (jobId, options, command) => {
    const json = getJsonFlag(command);
    const backendClient = backendFactory(buildBackendConfig(command, env));
    const intervalMs = parsePollingOption(options.interval, 2_000, "interval");
    const timeoutMs = parsePollingOption(options.timeout, 120_000, "timeout");

    const finalJob = await pollJobStatus(backendClient, jobId, {
      intervalMs,
      timeoutMs,
      onTick: json ? undefined : createStatusTicker("Job", stdout),
    });

    if (json) {
      printJson(finalJob, stdout);
    } else {
      printText(JSON.stringify(finalJob, null, 2), stdout);
    }
  });

  const taskGet = task.command("get <jobId>").description("Alias of jobs get");
  configureBackendOptions(taskGet);
  taskGet.action(async (jobId, options, command) => {
    const json = getJsonFlag(command);
    const backendClient = backendFactory(buildBackendConfig(command, env));
    const job = await getJobStatus(backendClient, jobId);
    if (json) {
      printJson(job, stdout);
    } else {
      printText(JSON.stringify(job, null, 2), stdout);
    }
  });

  const taskPoll = task
    .command("poll <jobId>")
    .description("Alias of jobs poll")
    .option("--interval <ms>", "Polling interval in milliseconds", "2000")
    .option("--timeout <ms>", "Polling timeout in milliseconds", "120000");
  configureBackendOptions(taskPoll);
  taskPoll.action(async (jobId, options, command) => {
    const json = getJsonFlag(command);
    const backendClient = backendFactory(buildBackendConfig(command, env));
    const intervalMs = parsePollingOption(options.interval, 2_000, "interval");
    const timeoutMs = parsePollingOption(options.timeout, 120_000, "timeout");
    const finalJob = await pollJobStatus(backendClient, jobId, {
      intervalMs,
      timeoutMs,
      onTick: json ? undefined : createStatusTicker("Job", stdout),
    });

    if (json) {
      printJson(finalJob, stdout);
    } else {
      printText(JSON.stringify(finalJob, null, 2), stdout);
    }
  });

  const workflows = program.command("workflows").description("Inspect compiled workflows");
  const workflowsGet = workflows.command("get <workflowId>").description("Get workflow metadata");
  configureBackendOptions(workflowsGet);
  workflowsGet.action(async (workflowId, options, command) => {
    const json = getJsonFlag(command);
    const backendClient = backendFactory(buildBackendConfig(command, env));
    const workflow = await getWorkflowDetails(backendClient, workflowId);
    if (json) {
      printJson(workflow, stdout);
    } else {
      printText(JSON.stringify(workflow, null, 2), stdout);
    }
  });

  const run = program
    .command("run <workflowId>")
    .description("Execute a compiled workflow")
    .option("--input-json <json>", "JSON input payload")
    .option("--input-file <path>", "JSON file containing input payload")
    .option("--async", "Run asynchronously")
    .option("--wait", "If async, poll until the run is completed")
    .option("--interval <ms>", "Polling interval in milliseconds", "2000")
    .option("--timeout <ms>", "Polling timeout in milliseconds", "120000");
  configureBackendOptions(run);
  run.action(async (workflowId, options, command) => {
    const json = getJsonFlag(command);
    const backendClient = backendFactory(buildBackendConfig(command, env));
    const inputPayload = parseRunInputPayload(options);
    const runResult = await runWorkflow(backendClient, workflowId, inputPayload, {
      async: options.async,
    });

    if (!options.async || !options.wait || !runResult.run_id) {
      emitRunResult({ run: runResult }, { json, stdout });
      return;
    }

    const intervalMs = parsePollingOption(options.interval, 2_000, "interval");
    const timeoutMs = parsePollingOption(options.timeout, 120_000, "timeout");
    const finalRun = await pollRunStatus(backendClient, runResult.run_id, {
      intervalMs,
      timeoutMs,
      onTick: json ? undefined : createStatusTicker("Run", stdout),
    });

    emitRunResult({ run: runResult, finalRun }, { json, stdout });
  });

  const runs = program.command("runs").description("Inspect asynchronous workflow runs");
  const runsGet = runs.command("get <runId>").description("Get run status");
  configureBackendOptions(runsGet);
  runsGet.action(async (runId, options, command) => {
    const json = getJsonFlag(command);
    const backendClient = backendFactory(buildBackendConfig(command, env));
    const runStatus = await getRunStatus(backendClient, runId);
    if (json) {
      printJson(runStatus, stdout);
    } else {
      printText(JSON.stringify(runStatus, null, 2), stdout);
    }
  });

  const runsPoll = runs
    .command("poll <runId>")
    .description("Poll run until completed/failed")
    .option("--interval <ms>", "Polling interval in milliseconds", "2000")
    .option("--timeout <ms>", "Polling timeout in milliseconds", "120000");
  configureBackendOptions(runsPoll);
  runsPoll.action(async (runId, options, command) => {
    const json = getJsonFlag(command);
    const backendClient = backendFactory(buildBackendConfig(command, env));
    const intervalMs = parsePollingOption(options.interval, 2_000, "interval");
    const timeoutMs = parsePollingOption(options.timeout, 120_000, "timeout");

    const finalRun = await pollRunStatus(backendClient, runId, {
      intervalMs,
      timeoutMs,
      onTick: json ? undefined : createStatusTicker("Run", stdout),
    });

    if (json) {
      printJson(finalRun, stdout);
    } else {
      printText(JSON.stringify(finalRun, null, 2), stdout);
    }
  });

  try {
    await program.parseAsync(args, { from: "user" });
    return 0;
  } catch (error) {
    if (error.code === "commander.helpDisplayed") {
      return 0;
    }
    if (error.code === "commander.version") {
      return 0;
    }
    throw error;
  }
}

export async function executeCli(args, dependencies = {}) {
  const stdout = dependencies.stdout ?? process.stdout;
  const stderr = dependencies.stderr ?? process.stderr;
  const forwarder = dependencies.forwarder ?? forwardToAgentBrowser;

  try {
    if (shouldForwardToAgentBrowser(args)) {
      return forwarder(args, { env: dependencies.env ?? process.env });
    }

    return await runNativeCli(args, dependencies);
  } catch (error) {
    const cliError = toCliError(error);
    const json = args.includes("--json");
    printError(cliError.message, {
      json,
      stderr,
      code: cliError.code,
      details: cliError.details,
    });
    return cliError.exitCode;
  }
}
