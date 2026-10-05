/**
 * Command and path policy.
 *
 * Applied to every shell command X-IT runs, regardless of backend. These are
 * "always blocked" actions from the security model: host escape, credential
 * theft, filesystem destruction, persistence, and resource abuse.
 */

export interface PolicyViolation {
  rule: string;
  detail: string;
}

const BLOCKED_COMMAND_RULES: { rule: string; pattern: RegExp; detail: string }[] = [
  { rule: "rm-root", pattern: /\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*[rf][a-zA-Z]*\s+\/(\s|$)/, detail: "recursive delete of /" },
  { rule: "rm-root-glob", pattern: /\brm\s+-[a-zA-Z]*rf?[a-zA-Z]*\s+\/\*/, detail: "recursive delete of /*" },
  { rule: "mkfs", pattern: /\bmkfs(\.\w+)?\b/, detail: "filesystem format" },
  { rule: "dd-device", pattern: /\bdd\b[^\n]*\bof=\/dev\//, detail: "raw write to block device" },
  { rule: "fork-bomb", pattern: /:\s*\(\s*\)\s*\{.*\|.*&.*\}\s*;?\s*:/, detail: "fork bomb" },
  { rule: "pipe-to-shell", pattern: /\b(curl|wget)\b[^\n]*\|\s*(sudo\s+)?(ba|z|k)?sh\b/, detail: "piping remote content to a shell" },
  { rule: "shutdown", pattern: /\b(shutdown|reboot|halt|poweroff|init\s+0)\b/, detail: "host shutdown" },
  { rule: "sudo-rm", pattern: /\bsudo\s+rm\b/, detail: "privileged delete" },
  { rule: "chmod-root", pattern: /\bchmod\s+(-R\s+)?777\s+\/(\s|$)/, detail: "world-writable root" },
  { rule: "passwd-shadow", pattern: /\/etc\/(shadow|passwd|sudoers)/, detail: "system credential files" },
  { rule: "ssh-keys", pattern: /(\.ssh\/id_[a-z0-9]+|authorized_keys)/i, detail: "SSH key access" },
  { rule: "docker-sock", pattern: /\/var\/run\/docker\.sock/, detail: "host docker socket access" },
  { rule: "host-proc", pattern: /\/(proc\/sysrq|sys\/kernel)/, detail: "host kernel access" },
  { rule: "nc-listen", pattern: /\bnc\b[^\n]*\s-l\b/, detail: "reverse shell listener" },
  { rule: "history-exfil", pattern: /\b(env|printenv)\b[^\n]*\|\s*(curl|nc|wget)\b/, detail: "environment exfiltration" },
  { rule: "credential-harvest", pattern: /(aws_|openai_|anthropic_|github_|stripe_|nextauth_)[a-z_]*key|\.credentials\.json|\.aws\/credentials/i, detail: "credential harvesting" },
];

export function checkCommand(command: string): PolicyViolation | null {
  const normalized = command.replace(/\s+/g, " ");
  for (const { rule, pattern, detail } of BLOCKED_COMMAND_RULES) {
    if (pattern.test(normalized)) return { rule, detail };
  }
  return null;
}

/** Prevent path traversal outside the sandbox workspace. */
export function resolveWorkspacePath(workspaceDir: string, requested: string): string | null {
  const { isAbsolute, join, normalize, sep } = require("node:path") as typeof import("node:path");
  const clean = requested.trim();
  const candidate = isAbsolute(clean) ? normalize(clean) : normalize(join(workspaceDir, clean));
  const root = normalize(workspaceDir);
  if (candidate === root) return candidate;
  return candidate.startsWith(root + sep) ? candidate : null;
}

export const MAX_OUTPUT_BYTES = 200_000;
export const DEFAULT_TIMEOUT_SECONDS = 30;
export const MAX_TIMEOUT_SECONDS = 300;
