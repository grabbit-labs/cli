export class CliError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "CliError";
    this.code = options.code ?? "CLI_ERROR";
    this.exitCode = options.exitCode ?? 1;
    this.details = options.details;
  }
}

export function toCliError(error) {
  if (error instanceof CliError) {
    return error;
  }

  if (error instanceof Error) {
    return new CliError(error.message, { details: { stack: error.stack } });
  }

  return new CliError(String(error));
}
