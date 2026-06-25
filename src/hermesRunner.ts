/**
 * Helpers to invoke the `hermes` CLI either locally or on a remote host over SSH.
 *
 * When an SSH target is configured, hermes runs as:
 *   ssh <ssh-options> <target> '<hermesPath> <quoted args...>'
 * Each argument is POSIX single-quoted so the remote shell receives it verbatim
 * (prompts with spaces, quotes, etc. survive the round-trip).
 */

export interface HermesTarget {
  /** Local binary path, or the remote path when sshTarget is set. */
  hermesPath: string;
  /** SSH host/server or an ssh config alias. Empty = local. */
  sshTarget?: string;
  /** SSH port. Omitted/22 uses the ssh default (or the alias's configured port). */
  sshPort?: string;
  /** SSH username. Empty lets the ssh alias/config decide. */
  sshUser?: string;
  /** Path to a private key file (-i). Empty uses ssh-agent / default keys. */
  sshKey?: string;
  /** HERMES_HOME — selects a specific hermes config dir (e.g. a distinct profile/instance). */
  hermesHome?: string;
}

/** POSIX single-quote a string so a shell receives it as a single literal token. */
export function shellQuote(s: string): string {
  if (s === '') {
    return "''";
  }
  return "'" + s.replace(/'/g, `'\\''`) + "'";
}

/**
 * Build the [command, args] pair to pass to child_process.spawn for a given
 * hermes argv (e.g. ['chat', '-q', prompt, '--quiet']).
 */
/**
 * Build the [command, args] to run an arbitrary command on the target (local or
 * over SSH), with HERMES_HOME applied. Used for both `hermes` and helper tools
 * like `python3` that need to run where hermes lives.
 */
export function buildInvocation(
  target: HermesTarget,
  command: string,
  cmdArgs: string[]
): { command: string; args: string[]; env?: Record<string, string> } {
  const host = (target.sshTarget || '').trim();
  const home = (target.hermesHome || '').trim();

  if (host) {
    // HERMES_HOME is baked into the remote command so it applies on the server.
    const tokens: string[] = [];
    if (home) {
      tokens.push('HERMES_HOME=' + shellQuote(home));
    }
    tokens.push(...[command, ...cmdArgs].map(shellQuote));
    const remoteCmd = tokens.join(' ');

    const sshArgs = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8'];
    const port = (target.sshPort || '').trim();
    if (port && port !== '22') {
      sshArgs.push('-p', port);
    }
    const key = (target.sshKey || '').trim();
    if (key) {
      sshArgs.push('-i', key);
    }
    const user = (target.sshUser || '').trim();
    sshArgs.push(user ? `${user}@${host}` : host);
    sshArgs.push(remoteCmd);

    return { command: 'ssh', args: sshArgs };
  }

  // Local: pass HERMES_HOME via the child's environment.
  const env = home ? { HERMES_HOME: home } : undefined;
  return { command, args: cmdArgs, env };
}

export function buildHermesInvocation(
  target: HermesTarget,
  hermesArgs: string[]
): { command: string; args: string[]; env?: Record<string, string> } {
  const bin = (target.hermesPath || '').trim() || 'hermes';
  return buildInvocation(target, bin, hermesArgs);
}
