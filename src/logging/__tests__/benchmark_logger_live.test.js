import {describe, expect, it} from 'vitest';

import {run_benchmark_logger_live_demo} from '../benchmark_logger_live_demo.js';

describe('benchmark logger live demo', () => {
  it('writes comparable JSONL output for baseline and achievement flows', async () => {
    const results = await run_benchmark_logger_live_demo();

    const baselineTypes = results.baseline.entries.map(entry => entry.type);
    expect(baselineTypes).toContain('run_started');
    expect(baselineTypes).toContain('command_completed');
    expect(baselineTypes).toContain('action_completed');
    expect(baselineTypes).toContain('action_interrupted');
    expect(baselineTypes).toContain('command_parse_failed');
    expect(baselineTypes).toContain('run_completed');

    const achievementTypes =
        results.achievement.entries.map(entry => entry.type);
    expect(achievementTypes).toContain('spl_rollout_started');
    expect(achievementTypes).toContain('ptd_self_refine_started');
    expect(achievementTypes).toContain('llm_stage_timed');
    expect(achievementTypes).toContain('ptd_self_refine_completed');
    expect(achievementTypes).toContain('nts_selected');
    expect(achievementTypes).toContain('am_action_generated');
    expect(achievementTypes).toContain('spl_rollout_completed');
    expect(achievementTypes).toContain('run_completed');

    const selfRefineSummary = results.achievement.entries.find(
        entry => entry.type === 'ptd_self_refine_completed');
    expect(selfRefineSummary.accepted).toBe(true);
    expect(selfRefineSummary.rounds_used).toBe(1);
  });
});
