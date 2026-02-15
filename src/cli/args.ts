const argv = process.argv.slice(2);

export function getArg(name: string): string | undefined {
  const idx = argv.indexOf(`--${name}`);
  return idx >= 0 ? argv[idx + 1] : undefined;
}

export function requireArg(name: string, usage: string): string {
  const value = getArg(name);
  if (!value) {
    console.error(usage);
    process.exit(1);
  }
  return value;
}

export function getServerUrl(): string {
  return process.env.SOLID_SERVER_URL ?? getArg('serverUrl') ?? 'http://localhost:3000';
}

export function getPassphrase(): string {
  const passphrase = process.env.INTERITION_PASSPHRASE;
  if (!passphrase) {
    console.error(JSON.stringify({
      error: 'No passphrase provided. Set INTERITION_PASSPHRASE environment variable.',
    }));
    process.exit(1);
  }
  return passphrase;
}
