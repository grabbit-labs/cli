import test from "node:test";
import assert from "node:assert/strict";

import {
  parseContextEnvelope,
  parseInputSpec,
  parseMatcherSpec,
  parseNavigationSpec,
  parseOutputSpec,
} from "../src/lib/context-schema.js";

test("parseContextEnvelope applies defaults and validates payload", () => {
  const parsed = parseContextEnvelope({
    goal: "Get stock price",
    matchers: [{ type: "output", value: "price" }],
  });

  assert.deepEqual(parsed.inputs, []);
  assert.deepEqual(parsed.outputs, []);
  assert.deepEqual(parsed.navigation_log, []);
});

test("parseMatcherSpec validates matcher format", () => {
  assert.deepEqual(parseMatcherSpec("output:price"), {
    type: "output",
    value: "price",
  });

  assert.throws(() => parseMatcherSpec("price"), /Expected format/);
  assert.throws(() => parseMatcherSpec("unknown:value"), /type must be "input" or "output"/);
});

test("parse input/output/navigation spec helpers", () => {
  assert.deepEqual(parseInputSpec("symbol:AAPL:true"), {
    name: "symbol",
    example: "AAPL",
    required: true,
  });

  assert.deepEqual(parseOutputSpec("price:123.45"), {
    name: "price",
    example_value: "123.45",
  });

  assert.deepEqual(parseNavigationSpec("click|https://example.com||#submit"), {
    action: "click",
    url: "https://example.com",
    selector: "#submit",
  });
});
