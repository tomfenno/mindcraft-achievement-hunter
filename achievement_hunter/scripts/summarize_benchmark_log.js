import path from 'path';

import {summarize_benchmark_log} from '../../src/logging/benchmark_log_summary.js';

const targetPath =
    process.argv[2] ??
    path.join(process.cwd(), 'logs', 'benchmark_live_demo');

const summaries = summarize_benchmark_log(targetPath);

for (const item of summaries) {
  console.log(JSON.stringify(item, null, 2));
}
