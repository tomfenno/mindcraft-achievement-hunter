/**
 * Unit tests for AchievementAgentProcess._should_restart.
 *
 * _should_restart is a pure decision function — no I/O, no state — so it is
 * ideal to characterize before refactoring to lock in the restart policy.
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const {spawnMock, logoutAgentMock} = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  logoutAgentMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: spawnMock,
}));

vi.mock('../../../../src/mindcraft/mindserver.js', () => ({
  logoutAgent: logoutAgentMock,
}));

import {AchievementAgentProcess} from '../achievement_agent_process.js';

let proc;

function makeChildProcessMock() {
  const handlers = new Map();
  return {
    kill: vi.fn(),
    on: vi.fn((event, handler) => {
      handlers.set(event, handler);
    }),
    emit(event, ...args) {
      const handler = handlers.get(event);
      if (handler) {
        handler(...args);
      }
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  proc = new AchievementAgentProcess('test-agent', 8080);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AchievementAgentProcess._should_restart', () => {
  it('returns true when exit code is non-zero and signal is not SIGINT', () => {
    expect(proc._should_restart(1, null)).toBe(true);
  });

  it('returns false on exit code 0 (clean exit)', () => {
    expect(proc._should_restart(0, null)).toBe(false);
  });

  it('returns false when stopped via SIGINT regardless of exit code', () => {
    expect(proc._should_restart(1, 'SIGINT')).toBe(false);
    expect(proc._should_restart(0, 'SIGINT')).toBe(false);
  });

  it('returns false when an intentional stop was requested', () => {
    proc._stop_requested = true;
    expect(proc._should_restart(1, null)).toBe(false);
  });

  it('returns true on unexpected signals like SIGTERM', () => {
    expect(proc._should_restart(null, 'SIGTERM')).toBe(true);
  });

  it('returns true on exit code 1 with no signal (typical crash)', () => {
    expect(proc._should_restart(1, undefined)).toBe(true);
  });
});

describe('AchievementAgentProcess stop and restart behavior', () => {
  it('does not restart after stop() even when the child exits with code 1', () => {
    const child = makeChildProcessMock();
    spawnMock.mockReturnValueOnce(child);
    const exitSpy = vi.spyOn(process, 'exit')
        .mockImplementation(() => undefined);

    proc.start(false, 0);
    proc.stop();
    child.emit('exit', 1, null);

    expect(child.kill).toHaveBeenCalledWith('SIGINT');
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(logoutAgentMock).toHaveBeenCalledWith('test-agent');
  });

  it('restarts after an unexpected non-zero exit when no stop was requested', () => {
    const firstChild = makeChildProcessMock();
    const restartedChild = makeChildProcessMock();
    spawnMock
        .mockReturnValueOnce(firstChild)
        .mockReturnValueOnce(restartedChild);
    vi.spyOn(Date, 'now')
        .mockReturnValueOnce(0)
        .mockReturnValue(20_000);

    proc.start(false, 0);
    firstChild.emit('exit', 1, null);

    expect(spawnMock).toHaveBeenCalledTimes(2);
  });
});
