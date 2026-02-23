import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('getMultiArg', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function loadWithArgs(args: string[]) {
    vi.stubGlobal('process', { ...process, argv: ['node', 'test', ...args] });
    return import('../../src/cli/args.js');
  }

  it('returns empty array when flag is absent', async () => {
    const { getMultiArg } = await loadWithArgs(['--name', 'alpha']);
    expect(getMultiArg('capabilities')).toEqual([]);
  });

  it('returns single value', async () => {
    const { getMultiArg } = await loadWithArgs(['--capabilities', 'coding']);
    expect(getMultiArg('capabilities')).toEqual(['coding']);
  });

  it('returns multiple values from repeated flags', async () => {
    const { getMultiArg } = await loadWithArgs([
      '--capabilities', 'coding',
      '--name', 'alpha',
      '--capabilities', 'research',
    ]);
    expect(getMultiArg('capabilities')).toEqual(['coding', 'research']);
  });
});
