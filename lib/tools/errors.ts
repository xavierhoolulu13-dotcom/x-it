export class PolicyViolationError extends Error {
  rule: string;

  constructor(rule: string, detail: string) {
    super(`Blocked by X-IT security policy (${rule}): ${detail}`);
    this.name = "PolicyViolationError";
    this.rule = rule;
  }
}

export class ApprovalRejectedError extends Error {
  constructor(toolName: string) {
    super(`User rejected the request to run '${toolName}'`);
    this.name = "ApprovalRejectedError";
  }
}

export class ApprovalTimeoutError extends Error {
  constructor(toolName: string, seconds: number) {
    super(`Approval for '${toolName}' expired after ${seconds}s without a decision`);
    this.name = "ApprovalTimeoutError";
  }
}

export class ToolNotAllowedError extends Error {
  constructor(toolName: string) {
    super(`Tool '${toolName}' is not available`);
    this.name = "ToolNotAllowedError";
  }
}
