import {readdirSync, readFileSync, statSync} from 'fs';
import path from 'path';

function read_jsonl(filePath) {
  const text = readFileSync(filePath, 'utf8').trim();
  if (!text) return [];
  return text.split('\n').filter(Boolean).map(line => JSON.parse(line));
}

function get_jsonl_files(targetPath) {
  const stats = statSync(targetPath);
  if (stats.isFile()) return [targetPath];

  return readdirSync(targetPath)
      .filter(name => name.endsWith('.jsonl'))
      .map(name => path.join(targetPath, name));
}

function average(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function summarize_entries(entries) {
  const types = {};
  const commandDurations = [];
  const actionDurations = [];
  const llmDurations = [];

  for (const entry of entries) {
    types[entry.type] = (types[entry.type] ?? 0) + 1;

    if (entry.type === 'command_completed' || entry.type === 'command_failed') {
      if (typeof entry.duration_ms === 'number') commandDurations.push(entry.duration_ms);
    }
    if (entry.type === 'action_completed' || entry.type === 'action_failed') {
      if (typeof entry.duration_ms === 'number') actionDurations.push(entry.duration_ms);
    }
    if (entry.type === 'llm_stage_timed' && typeof entry.latency_ms === 'number') {
      llmDurations.push(entry.latency_ms);
    }
  }

  const first = entries[0] ?? {};
  const selfRefine = entries.find(entry => entry.type === 'ptd_self_refine_completed');

  return {
    run_id: first.run_id ?? null,
    agent_name: first.agent_name ?? null,
    agent_kind: first.agent_kind ?? null,
    event_counts: types,
    command_avg_ms: average(commandDurations),
    action_avg_ms: average(actionDurations),
    llm_avg_ms: average(llmDurations),
    self_refine_rounds: selfRefine?.rounds_used ?? null,
    self_refine_accepted: selfRefine?.accepted ?? null,
  };
}

export function summarize_benchmark_log(targetPath) {
  const files = get_jsonl_files(targetPath);
  return files.map(filePath => {
    const entries = read_jsonl(filePath);
    return {
      file: filePath,
      summary: summarize_entries(entries),
    };
  });
}
