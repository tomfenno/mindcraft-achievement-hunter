# Vanilla Advancement Benchmark

This benchmark runs single-agent Minecraft advancement tasks on fresh vanilla survival worlds generated from fixed seeds.

## Files

- `vanilla_advancements.json`: advancement tasks used by the suite
- `seeds.json`: committed set of five world seeds
- `vanilla_advancement_benchmark_config.json`: ready-to-run benchmark config for `baseline_andy` vs `our_agent`

## Task Schema

Each task is a JSON object with:

```json
{
  "stone_age": {
    "type": "advancement",
    "goal": "Starting from a fresh survival world, obtain the Stone Age advancement.",
    "advancement_id": "minecraft:story/mine_stone",
    "agent_count": 1,
    "timeout": 1800
  }
}
```

`advancement_id` must be a built-in Minecraft advancement. A run succeeds only when the bot's advancement file records that advancement with `"done": true`.

## Running

From the project root:

```powershell
python tasks/evaluation_script.py --benchmark_config tasks/advancement_tasks/vanilla_advancement_benchmark_config.json
```

The benchmark runs sequentially across:

- 2 agents
- 5 fixed seeds
- every task in `vanilla_advancements.json`

Results are written to:

```text
experiments/vanilla_advancements_v1/
```

Each episode produces:

- `episode_manifest.json`
- copied agent memory/history artifacts
- `latest.log`
- `server_stdout.log`
- `runner_stdout.log`

Suite-level files:

- `results.jsonl`
- `per_task.csv`
- `summary.csv`
