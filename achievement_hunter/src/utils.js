import {mkdirSync, readFileSync, writeFileSync} from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


/**
 * Extracts the first JSON object from an LLM response string and writes
 * it to filePath (creates parent directories as needed).
 * Returns the parsed object, or null if extraction failed.
 *
 * Usage example:
 * import { save_json } from './src/utils.js';
 *
 * const llmOutput = await prompter.promptConvo(messages);
 * const result = save_json(llm_output, './achievement_hunter/logs/output.json');
 */
export function save_json(str, file_path) {
  const obj = extract_json(str);
  if (obj === null) {
    console.warn('save_json: no valid JSON found in LLM response.');
    return null;
  }
  mkdirSync(path.dirname(file_path), {recursive: true});
  writeFileSync(file_path, JSON.stringify(obj, null, 4), 'utf8');
  return obj;
}



export function fill_ptd_prompt(objective) {
  const template = _read_template('../docs/prompts/ptd_prompts/ptd_prompt.md');
  return _fill(template, {OBJECTIVE: objective});
}

export function fill_ptd_feedback_prompt(objective, candidate_graph) {
  const template =
      _read_template('../docs/prompts/ptd_prompts/ptd_feedback_prompt.md');
  return _fill(
      template, {OBJECTIVE: objective, 'CANDIDATE GRAPH': candidate_graph});
}

export function fill_ptd_refinement_prompt(
    objective, candidate_graph, validator_output) {
  const template =
      _read_template('../docs/prompts/ptd_prompts/ptd_refinement_prompt.md');
  return _fill(template, {
    OBJECTIVE: objective,
    'CANDIDATE GRAPH': candidate_graph,
    'VALIDATOR OUTPUT': validator_output,
  });
}

export function fill_scsg_prompt(graph, state) {
  const template = _read_template('../docs/prompts/scsg_prompts/scsg_prompt.md');
  return _fill(template, {GRAPH: graph, STATE: state});
}

export function fill_scsg_feedback_prompt(task_prompt, candidate_answer) {
  const template =
      _read_template('../docs/prompts/scsg_prompts/scsg_feedback_prompt.md');
  return _fill(template, {
    'FULL TASK PROMPT WITH CONCRETE G AND S': task_prompt,
    'CANDIDATE JSON': candidate_answer,
  });
}

export function fill_scsg_refiner_prompt(
    task_prompt, previous_candidate, audit_report) {
  const template =
      _read_template('../docs/prompts/scsg_prompts/scsg_refiner_prompt.md');
  return _fill(template, {
    'FULL TASK PROMPT WITH CONCRETE G AND S': task_prompt,
    'PREVIOUS CANDIDATE JSON': previous_candidate,
    'AUDIT REPORT JSON': audit_report,
  });
}


/* Helper Functions ------------------------------------------------------ */

/**
 * Extracts the first JSON object or array from an LLM string response,
 * handling arbitrary text before/after and markdown code fences.
 * Returns the parsed object, or null if none found.
 *
 */
export function extract_json(str) {
  // strip markdown code fences if present
  const fenced = str.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) str = fenced[1];

  // find start of outermost { } or [ ]
  const start = str.search(/[{[]/);
  if (start === -1) return null;

  const openChar = str[start];
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0;
  let end = -1;

  for (let i = start; i < str.length; i++) {
    if (str[i] === openChar)
      depth++;
    else if (str[i] === closeChar) {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end === -1) return null;

  try {
    return JSON.parse(str.slice(start, end + 1));
  } catch {
    return null;
  }
}

// --- Prompt helpers ---

function _read_template(relative_path) {
  return readFileSync(path.join(__dirname, relative_path), 'utf8');
}

function _fill(template, inputs) {
  let result = template;
  for (const [key, value] of Object.entries(inputs)) {
    const serialized = (value !== null && typeof value === 'object') ?
        JSON.stringify(value, null, 2) :
        String(value);
    const filled = result.replaceAll(`{{${key}}}`, serialized);
    if (filled === result) {
      console.warn(`_fill: no placeholder found for key "${key}"`);
    }
    result = filled;
  }
  return result;
}