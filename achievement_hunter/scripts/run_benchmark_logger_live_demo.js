import {run_benchmark_logger_live_demo} from '../../src/logging/benchmark_logger_live_demo.js';
import {summarize_benchmark_log} from '../../src/logging/benchmark_log_summary.js';

const results = await run_benchmark_logger_live_demo();
const summaryOnly = process.argv.includes('--summary');

if (summaryOnly) {
  for (const item of summarize_benchmark_log(results.baseDir)) {
    console.log(JSON.stringify(item, null, 2));
  }
  process.exit(0);
}

for (const [label, info] of Object.entries({
       baseline: results.baseline,
       achievement: results.achievement,
     })) {
  console.log(`\n=== ${label.toUpperCase()} ===`);
  console.log(`file: ${info.filePath}`);
  for (const entry of info.entries) {
    console.log(JSON.stringify(entry));
  }
}
