/** A failure the agent can read and act on. Thrown by handlers, turned into an isError result by the runner. */
export class ToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ToolError';
  }
}
