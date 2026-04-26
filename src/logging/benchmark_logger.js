import {appendFileSync, mkdirSync} from 'fs';
import path from 'path';

function sanitize_file_component(value) {
  return String(value ?? 'unknown')
      .trim()
      .replace(/[^a-z0-9._-]/gi, '_')
      .replace(/_+/g, '_')
      .slice(0, 80);
}

function now_iso() {
  return new Date().toISOString();
}

export class BenchmarkLogger {
  constructor({
    runId,
    logDir = process.env.BENCHMARK_LOG_DIR || './logs/benchmark',
    fileLabel = 'agent',
    staticContext = {},
  } = {}) {
    this.runId = runId ?? process.env.BENCHMARK_RUN_ID ?? `run_${Date.now()}`;
    this.staticContext = {...staticContext};
    this.logDir = logDir;
    this.filePath = path.join(
        logDir,
        `${sanitize_file_component(this.runId)}__${
            sanitize_file_component(fileLabel)}.jsonl`);

    mkdirSync(this.logDir, {recursive: true});
    this._finalized = false;
  }

  setContext(nextContext = {}) {
    this.staticContext = {...this.staticContext, ...nextContext};
  }

  event(type, data = {}) {
    const entry = {
      ts: now_iso(),
      run_id: this.runId,
      type,
      ...this.staticContext,
      ...data,
    };

    appendFileSync(this.filePath, JSON.stringify(entry) + '\n', 'utf8');
  }

  startSpan(type, data = {}) {
    const start = Date.now();
    const spanId =
        `${type}_${start}_${Math.random().toString(36).slice(2, 8)}`;

    this.event(`${type}_started`, {
      span_id: spanId,
      ...data,
    });

    return {
      end: (endData = {}) => {
        this.event(`${type}_completed`, {
          span_id: spanId,
          duration_ms: Date.now() - start,
          ...endData,
        });
      },
      fail: (err, endData = {}) => {
        this.event(`${type}_failed`, {
          span_id: spanId,
          duration_ms: Date.now() - start,
          error: err?.message ?? String(err),
          ...endData,
        });
      },
    };
  }

  finalize(summary = {}) {
    if (this._finalized) return;
    this._finalized = true;
    this.event('run_completed', summary);
  }
}

export function emit_benchmark_event(logger, type, data = {}) {
  if (!logger || typeof logger.event !== 'function') return;
  logger.event(type, data);
}

export function start_benchmark_span(logger, type, data = {}) {
  if (!logger || typeof logger.startSpan !== 'function') return null;
  return logger.startSpan(type, data);
}
