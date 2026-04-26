import {BenchmarkLogger, emit_benchmark_event} from './benchmark_logger.js';

function install_process_lifecycle_hooks(logger) {
  if (!logger || logger.__process_hooks_installed) return;
  logger.__process_hooks_installed = true;

  process.once('exit', code => {
    try {
      logger.finalize({exit_code: code});
    } catch (error) {
      console.warn('[BENCHMARK_LOGGER] finalize on exit failed:', error);
    }
  });
}

export function attach_benchmark_logger(target, {
  agentName = null,
  agentKind = 'baseline',
  profileName = null,
  countId = null,
  runId = null,
  logDir = null,
  extraContext = {},
} = {}) {
  const logger = new BenchmarkLogger({
    runId,
    logDir: logDir ?? process.env.BENCHMARK_LOG_DIR ?? './logs/benchmark',
    fileLabel: agentName ?? profileName ?? agentKind,
    staticContext: {
      agent_name: agentName,
      agent_kind: agentKind,
      profile_name: profileName ?? agentName,
      count_id: countId,
      ...extraContext,
    },
  });

  target.benchmark_logger = logger;
  install_process_lifecycle_hooks(logger);

  emit_benchmark_event(logger, 'run_started', {
    logger_file: logger.filePath,
  });

  return logger;
}
