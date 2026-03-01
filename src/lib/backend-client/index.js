import { CliError } from "../errors.js";
import { HttpBackendClient } from "./http-client.js";
import { MockBackendClient } from "./mock-client.js";

export function createBackendClient(config = {}) {
  const mode = String(config.backendMode ?? "mock").toLowerCase();

  if (mode === "live") {
    return new HttpBackendClient(config);
  }

  if (mode === "mock") {
    return new MockBackendClient(config);
  }

  throw new CliError(`Unknown backend mode: ${mode}. Expected "mock" or "live".`, {
    code: "INVALID_BACKEND_MODE",
    exitCode: 1,
  });
}
