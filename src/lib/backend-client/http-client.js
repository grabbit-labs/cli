import { readFileSync } from "node:fs";
import path from "node:path";

import { CliError } from "../errors.js";
import { ENDPOINTS, toAbsoluteUrl } from "./endpoints.js";

function parseResponseBody(rawText) {
  if (!rawText) {
    return {};
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return { message: rawText };
  }
}

export class HttpBackendClient {
  constructor(config = {}) {
    this.apiBaseUrl = config.apiBaseUrl;
    this.token = config.token;
    this.authValidationPath = config.authValidationPath ?? ENDPOINTS.validateAuth;
    this.timeoutMs = Number(config.timeoutMs ?? 30_000);
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async request(endpointPath, options = {}) {
    if (!this.apiBaseUrl) {
      throw new CliError("Missing API base URL. Set GRABBIT_API_BASE_URL or run `grabbit account login --api-url ...`.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const url = toAbsoluteUrl(this.apiBaseUrl, endpointPath);
    const headers = {
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...(options.headers ?? {}),
    };

    try {
      const response = await this.fetchImpl(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      const rawBody = await response.text();
      const body = parseResponseBody(rawBody);

      if (!response.ok) {
        throw new CliError(
          body.error ??
            body.message ??
            `Request failed with status ${response.status} for ${endpointPath}`,
          {
            code: "HTTP_REQUEST_FAILED",
            details: {
              endpoint: endpointPath,
              status: response.status,
              body,
            },
          },
        );
      }

      return body;
    } catch (error) {
      if (error.name === "AbortError") {
        throw new CliError(`Request to ${endpointPath} timed out after ${this.timeoutMs}ms`, {
          code: "HTTP_TIMEOUT",
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async validateAuth(token) {
    const effectiveToken = token ?? this.token;
    const headers = effectiveToken ? { Authorization: `Bearer ${effectiveToken}` } : {};
    return this.request(this.authValidationPath, {
      method: "GET",
      headers,
    });
  }

  async submitCompile({ harPath, context }) {
    const harBuffer = readFileSync(harPath);
    const harFilename = path.basename(harPath);
    const form = new FormData();
    form.append("har_file", new Blob([harBuffer]), harFilename);
    form.append("context", JSON.stringify(context));

    return this.request(ENDPOINTS.compile, {
      method: "POST",
      body: form,
    });
  }

  async getJob(jobId) {
    return this.request(ENDPOINTS.job(jobId), {
      method: "GET",
    });
  }

  async getWorkflow(workflowId) {
    return this.request(ENDPOINTS.workflow(workflowId), {
      method: "GET",
    });
  }

  async runWorkflow(workflowId, input, options = {}) {
    const shouldRunAsync = Boolean(options.async);
    const endpoint = shouldRunAsync
      ? `${ENDPOINTS.run(workflowId)}?async=true`
      : ENDPOINTS.run(workflowId);

    return this.request(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(shouldRunAsync ? { "x-grabbit-async": "true" } : {}),
      },
      body: JSON.stringify(input ?? {}),
    });
  }

  async getRun(runId) {
    return this.request(ENDPOINTS.runStatus(runId), {
      method: "GET",
    });
  }
}
