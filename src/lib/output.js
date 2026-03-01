import { inspect } from "node:util";

export function maskToken(token) {
  if (!token) {
    return "";
  }

  if (token.length <= 8) {
    return `${token.slice(0, 2)}***${token.slice(-1)}`;
  }

  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export function printJson(value, stdout = process.stdout) {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printText(text, stdout = process.stdout) {
  stdout.write(`${text}\n`);
}

export function printResult(value, options = {}) {
  const { json = false, stdout = process.stdout } = options;
  if (json) {
    printJson(value, stdout);
    return;
  }

  if (typeof value === "string") {
    printText(value, stdout);
    return;
  }

  printText(inspect(value, { depth: 6, colors: false, compact: false }), stdout);
}

export function printError(message, options = {}) {
  const { json = false, stderr = process.stderr, code = "CLI_ERROR", details } = options;

  if (json) {
    stderr.write(
      `${JSON.stringify(
        {
          error: message,
          code,
          ...(details ? { details } : {}),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  stderr.write(`grabbit: ${message}\n`);
}
