import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { getRuntimeConfig, saveConfig } from "../src/lib/config-store.js";
import { getLoginStatus, logout, storeLogin } from "../src/lib/auth-store.js";

function createEnv() {
  const dir = mkdtempSync(path.join(tmpdir(), "grabbit-config-test-"));
  return {
    GRABBIT_CONFIG_PATH: path.join(dir, "config.json"),
    GRABBIT_MOCK_DB_PATH: path.join(dir, "mock-db.json"),
  };
}

test("config store persists and resolves env overrides", () => {
  const env = createEnv();

  saveConfig({ apiBaseUrl: "https://api.example.com", backendMode: "live" }, { env });
  const storedRuntime = getRuntimeConfig({ env });
  assert.equal(storedRuntime.apiBaseUrl, "https://api.example.com");
  assert.equal(storedRuntime.backendMode, "live");

  const overridden = getRuntimeConfig({
    env: { ...env, GRABBIT_BACKEND_MODE: "mock", GRABBIT_API_BASE_URL: "https://override.local" },
  });
  assert.equal(overridden.backendMode, "mock");
  assert.equal(overridden.apiBaseUrl, "https://override.local");
});

test("auth store login status and logout flow", () => {
  const env = createEnv();

  storeLogin(
    {
      token: "sk_test_12345",
      apiBaseUrl: "https://api.grabbit.dev",
      backendMode: "mock",
    },
    { env },
  );

  const loggedIn = getLoginStatus({ env });
  assert.equal(loggedIn.loggedIn, true);
  assert.equal(loggedIn.backendMode, "mock");
  assert.equal(loggedIn.apiBaseUrl, "https://api.grabbit.dev");
  assert.match(loggedIn.tokenPreview, /sk_t/);

  const afterLogout = logout({ env });
  assert.equal(afterLogout.loggedIn, false);
  assert.equal(afterLogout.tokenPreview, null);
});
