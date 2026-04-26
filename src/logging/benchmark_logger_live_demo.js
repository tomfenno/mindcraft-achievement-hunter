import {mkdirSync, readFileSync, rmSync} from 'fs';
import path from 'path';

import {actionsList} from '../agent/commands/actions.js';
import {executeCommand, registerCommands} from '../agent/commands/index.js';
import {attach_benchmark_logger} from './attach_benchmark_logger.js';
import {generate_self_refined_ptd} from '../../achievement_hunter/src/pipeline/self_refine.js';
import {createRolloutLogger} from '../../achievement_hunter/src/pipeline/rollout_logger.js';

function make_demo_graph(objective = 'demo_objective') {
  return {
    objective,
    sinks: ['oak_log'],
    vertices: [
      {
        id: 'oak_log',
        qty: 3,
        item_type: 'resource',
        acquisition_dependency: 'none',
      },
    ],
    edges: [],
  };
}

function parse_jsonl(filePath) {
  return readFileSync(filePath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
}

function register_demo_commands(prefix) {
  const queryCommand = {
    name: `!${prefix}Query`,
    description: 'Demo query command for benchmark logging.',
    perform: async () => 'demo-query-result',
  };

  const successAction = {
    name: `!${prefix}ActionSuccess`,
    description: 'Demo action success for benchmark logging.',
    perform: async () => ({
      success: true,
      message: 'Action output:\nDemo success.',
      interrupted: false,
      timedout: false,
      action_name: `${prefix}ActionSuccess`,
    }),
  };

  const interruptedAction = {
    name: `!${prefix}ActionInterrupted`,
    description: 'Demo action interruption for benchmark logging.',
    perform: async () => ({
      success: false,
      message: '',
      interrupted: true,
      timedout: false,
      action_name: `${prefix}ActionInterrupted`,
    }),
  };

  actionsList.push(successAction, interruptedAction);
  registerCommands([queryCommand, successAction, interruptedAction]);

  return {
    query: queryCommand.name,
    successAction: successAction.name,
    interruptedAction: interruptedAction.name,
  };
}

async function run_baseline_demo(logDir) {
  const baselineAgent = {};
  const commandPrefix = `benchmarkDemo${Date.now()}`;
  const commandNames = register_demo_commands(commandPrefix);
  const logger = attach_benchmark_logger(baselineAgent, {
    agentName: 'baseline_demo',
    profileName: 'baseline_demo',
    agentKind: 'baseline',
    runId: 'benchmark_logger_live_demo',
    logDir,
  });

  await executeCommand(baselineAgent, commandNames.query);
  await executeCommand(baselineAgent, commandNames.successAction);
  await executeCommand(baselineAgent, commandNames.interruptedAction);
  await executeCommand(baselineAgent, '!definitelyNotACommand');
  logger.finalize({demo_case: 'baseline'});

  return {
    filePath: logger.filePath,
    entries: parse_jsonl(logger.filePath),
  };
}

async function run_spl_demo(logDir) {
  const achievementAgent = {};
  const logger = attach_benchmark_logger(achievementAgent, {
    agentName: 'achievement_demo',
    profileName: 'achievement_demo',
    agentKind: 'achievement_hunter',
    runId: 'benchmark_logger_live_demo',
    logDir,
  });

  const rolloutLogger =
      createRolloutLogger('demo live objective', logger);
  const initialGraph = make_demo_graph('demo live objective');
  const refinedGraph = {
    ...initialGraph,
    vertices: [
      ...initialGraph.vertices,
      {
        id: 'crafting_table',
        qty: 1,
        item_type: 'workstation',
        acquisition_dependency: 'none',
      },
    ],
  };

  const models = {
    ptd: {
      model_name: 'demo-ptd-model',
      send_prompt: async () => JSON.stringify(initialGraph),
    },
    ptd_feedback: {
      model_name: 'demo-ptd-feedback-model',
      send_prompt: (() => {
        let callCount = 0;
        return async () => {
          callCount += 1;
          if (callCount === 1) {
            return JSON.stringify({
              verdict: 'fail',
              definite_issues: ['Missing crafting table workstation node'],
              possible_issues: [],
              summary: 'Need an explicit workstation vertex.',
            });
          }

          return JSON.stringify({
            verdict: 'pass',
            definite_issues: [],
            possible_issues: [],
            summary: 'Looks good.',
          });
        };
      })(),
    },
    ptd_refinement: {
      model_name: 'demo-ptd-refiner-model',
      send_prompt: async () => JSON.stringify(refinedGraph),
    },
  };

  await generate_self_refined_ptd(
      models, 'demo live objective', null, rolloutLogger,
      {max_rounds: 2, save_final_json: false});

  rolloutLogger.scsg('[deterministic]', {
    r: 1,
    s: ['oak_log'],
    final: {
      vertices: refinedGraph.vertices,
      edges: [],
    },
  });
  rolloutLogger.candidates([{
    id: 'oak_log',
    qty: 3,
    item_type: 'resource',
    acquisition_dependency: 'none',
    satisfied_inputs: [],
    source_hint: 'oak_log',
    source_kind: 'block',
    grounded_nearby_source: 'oak_log',
  }]);
  rolloutLogger.nts('[deterministic]', {
    target_item: 'oak_log',
    qty: 3,
    action_type: 'collect',
    parameters: {source_block: 'oak_log'},
  }, {source: 'deterministic'});
  rolloutLogger.am(1, '!collectBlocks("oak_log", 3)', {
    inventory: {},
    nearby_blocks: ['oak_log'],
  }, {source: 'deterministic'});
  rolloutLogger.complete('demo completed');
  logger.finalize({demo_case: 'achievement_hunter'});

  return {
    filePath: logger.filePath,
    entries: parse_jsonl(logger.filePath),
  };
}

export async function run_benchmark_logger_live_demo(
    baseDir = path.join(process.cwd(), 'logs', 'benchmark_live_demo')) {
  rmSync(baseDir, {recursive: true, force: true});
  mkdirSync(baseDir, {recursive: true});

  return {
    baseDir,
    baseline: await run_baseline_demo(baseDir),
    achievement: await run_spl_demo(baseDir),
  };
}
