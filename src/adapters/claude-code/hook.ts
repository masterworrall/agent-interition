#!/usr/bin/env tsx
/**
 * Claude Code PostToolUse hook for the Solid Memory bridge.
 *
 * Receives a Claude Code hook payload on stdin (PostToolUse on Write|Edit),
 * decides whether the touched file is a Claude Code memory file, and if so
 * invokes the bridge `push` for that project's memory dir.
 *
 * Setup: register in ~/.claude/settings.json under hooks.PostToolUse.
 * See `docs/claude-code-hook-setup.md` for the snippet.
 *
 * Per-project config: `~/.claude/projects/<slug>/.solid-memory-bridge.json`
 *   {
 *     "agent": "phoenix",
 *     "serverUrl": "http://ubuntu01.local:3001",
 *     "ipv4First": true
 *   }
 *
 * Exit codes:
 *   0 — handled (no-op or push succeeded)
 *   1 — error (logged to stderr; Claude Code surfaces it but does not block
 *       the tool, since this is PostToolUse)
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

interface HookPayload {
  tool_name?: string;
  tool_input?: {
    file_path?: string;
    path?: string;
    [k: string]: unknown;
  };
}

interface ProjectConfig {
  agent: string;
  serverUrl: string;
  ipv4First?: boolean;
}

async function main(): Promise<void> {
  const payload = await readStdinJson();
  const tool = payload.tool_name;
  if (tool !== 'Write' && tool !== 'Edit') return; // not relevant

  const filePath = payload.tool_input?.file_path ?? payload.tool_input?.path;
  if (typeof filePath !== 'string') return;

  const memoryRoot = path.join(os.homedir(), '.claude', 'projects');
  if (!filePath.startsWith(memoryRoot + path.sep)) return;

  // .../<slug>/memory/<file>.md
  const rel = filePath.slice(memoryRoot.length + 1);
  const segments = rel.split(path.sep);
  if (segments.length < 3) return;
  const [slug, maybeMemory, ...rest] = segments;
  if (maybeMemory !== 'memory') return;
  const filename = rest[rest.length - 1];
  if (!filename.endsWith('.md')) return;
  if (filename === 'MEMORY.md') return; // index, not an entry

  const projectDir = path.join(memoryRoot, slug);
  const memoryDir = path.join(projectDir, 'memory');
  const configPath = path.join(projectDir, '.solid-memory-bridge.json');

  let config: ProjectConfig;
  try {
    const text = await fs.readFile(configPath, 'utf8');
    config = JSON.parse(text) as ProjectConfig;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return; // not opted in
    throw err;
  }
  if (!config.agent || !config.serverUrl) {
    process.stderr.write(`solid-memory-bridge hook: ${configPath} missing agent or serverUrl\n`);
    process.exit(1);
  }

  await runPush(memoryDir, config);
}

function readStdinJson(): Promise<HookPayload> {
  return new Promise((resolve, reject) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (buf += chunk));
    process.stdin.on('end', () => {
      if (!buf.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(buf) as HookPayload);
      } catch (err) {
        reject(err);
      }
    });
    process.stdin.on('error', reject);
  });
}

function runPush(memoryDir: string, config: ProjectConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    const cliPath = path.resolve(new URL(import.meta.url).pathname, '../cli.ts');
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      SOLID_SERVER_URL: config.serverUrl,
    };
    if (config.ipv4First !== false) {
      env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ''} --dns-result-order=ipv4first`.trim();
    }
    const child = spawn(
      'npx',
      ['--yes', 'tsx', cliPath, '--agent', config.agent, 'push', '--memory-dir', memoryDir],
      { env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stderrBuf = '';
    child.stdout.on('data', () => {}); // discard JSON output; hook is fire-and-forget
    child.stderr.on('data', (d) => (stderrBuf += d.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else {
        process.stderr.write(stderrBuf);
        reject(new Error(`push exited with code ${code}`));
      }
    });
  });
}

main().catch((err) => {
  process.stderr.write(`solid-memory-bridge hook: ${(err as Error).message}\n`);
  process.exit(1);
});
