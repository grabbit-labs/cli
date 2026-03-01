import { z } from "zod";

import { CliError } from "./errors.js";

const matcherSchema = z.object({
  value: z.string().min(1),
  type: z.enum(["input", "output"]),
});

const inputSchema = z.object({
  name: z.string().min(1),
  example: z.string().optional(),
  required: z.boolean().optional(),
});

const outputSchema = z.object({
  name: z.string().min(1),
  example_value: z.string().optional(),
});

const navigationSchema = z.object({
  action: z.string().min(1),
  ts: z.union([z.number(), z.string()]).optional(),
  url: z.string().optional(),
  value: z.string().optional(),
  selector: z.string().optional(),
});

export const contextSchema = z.object({
  goal: z.string().min(1),
  matchers: z.array(matcherSchema).min(1),
  inputs: z.array(inputSchema).default([]),
  outputs: z.array(outputSchema).default([]),
  navigation_log: z.array(navigationSchema).default([]),
  notes: z.string().optional(),
});

export function parseContextEnvelope(value) {
  const result = contextSchema.safeParse(value);
  if (!result.success) {
    throw new CliError("Invalid compile context payload.", {
      code: "INVALID_CONTEXT",
      details: result.error.flatten(),
    });
  }
  return result.data;
}

export function parseMatcherSpec(spec) {
  const divider = spec.indexOf(":");
  if (divider === -1) {
    throw new CliError(
      `Invalid matcher "${spec}". Expected format "<input|output>:<value>" (example: output:stock price).`,
      { code: "INVALID_MATCHER_SPEC" },
    );
  }

  const type = spec.slice(0, divider).trim();
  const value = spec.slice(divider + 1).trim();

  if (!value) {
    throw new CliError(`Invalid matcher "${spec}". Matcher value cannot be empty.`, {
      code: "INVALID_MATCHER_SPEC",
    });
  }

  if (type !== "input" && type !== "output") {
    throw new CliError(`Invalid matcher "${spec}". Matcher type must be "input" or "output".`, {
      code: "INVALID_MATCHER_SPEC",
    });
  }

  return { type, value };
}

export function parseInputSpec(spec) {
  const [nameRaw, exampleRaw, requiredRaw] = spec.split(":");
  const name = nameRaw?.trim();
  if (!name) {
    throw new CliError(`Invalid input "${spec}". Expected format "name[:example][:required]".`, {
      code: "INVALID_INPUT_SPEC",
    });
  }

  const parsed = { name };
  if (exampleRaw && exampleRaw.trim()) {
    parsed.example = exampleRaw.trim();
  }

  if (requiredRaw !== undefined) {
    const normalized = requiredRaw.trim().toLowerCase();
    parsed.required = ["1", "true", "yes", "y"].includes(normalized);
  }

  return parsed;
}

export function parseOutputSpec(spec) {
  const [nameRaw, exampleRaw] = spec.split(":");
  const name = nameRaw?.trim();
  if (!name) {
    throw new CliError(`Invalid output "${spec}". Expected format "name[:example_value]".`, {
      code: "INVALID_OUTPUT_SPEC",
    });
  }

  const parsed = { name };
  if (exampleRaw && exampleRaw.trim()) {
    parsed.example_value = exampleRaw.trim();
  }

  return parsed;
}

export function parseNavigationSpec(spec) {
  const [actionRaw, urlRaw, valueRaw, selectorRaw] = spec.split(":");
  const action = actionRaw?.trim();
  if (!action) {
    throw new CliError(
      `Invalid navigation entry "${spec}". Expected format "action[:url][:value][:selector]".`,
      { code: "INVALID_NAVIGATION_SPEC" },
    );
  }

  const parsed = { action };
  if (urlRaw && urlRaw.trim()) {
    parsed.url = urlRaw.trim();
  }
  if (valueRaw && valueRaw.trim()) {
    parsed.value = valueRaw.trim();
  }
  if (selectorRaw && selectorRaw.trim()) {
    parsed.selector = selectorRaw.trim();
  }

  return parsed;
}
