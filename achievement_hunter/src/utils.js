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
 * const result = save_json(llmOutput, './achievement_hunter/logs/output.json');
 */
export function save_json(str, filePath) {
  const obj = extract_json(str);
  if (obj === null) {
    console.warn('saveJSON: no valid JSON found in LLM response.');
    return null;
  }
  mkdirSync(path.dirname(filePath), {recursive: true});
  writeFileSync(filePath, JSON.stringify(obj, null, 4), 'utf8');
  return obj;
}



export function fill_ptd_prompt(objective) {
  const template = _read_template('../docs/prompts/ptd_prompts/ptd_prompt.md');
  return _fill(template, {OBJECTIVE: objective});
}

export function fill_ptd_feedback_prompt(objective, candidateGraph) {
  const template =
      _read_template('../docs/prompts/ptd_prompts/ptd_feedback_prompt.md');
  return _fill(
      template, {OBJECTIVE: objective, 'CANIDATE GRAPH': candidateGraph});
}

export function fill_ptd_refinement_prompt(
    objective, candidateGraph, validatorOutput) {
  const template =
      _read_template('../docs/prompts/ptd_prompts/ptd_refinement_prompt.md');
  return _fill(template, {
    OBJECTIVE: objective,
    'CANDIDATE GRAPH': candidateGraph,
    'VALIDATOR OUTPUT': validatorOutput,
  });
}

export function fill_scsg_prompt(graph, state) {
  const template = _read_template('../docs/prompts/scsg_prompts/scsg_prompt.md');
  return _fill(template, {GRAPH: graph, STATE: state});
}

export function fill_scsg_feedback_prompt(taskPrompt, candidateAnswer) {
  const template =
      _read_template('../docs/prompts/scsg_prompts/scsg_feedback_prompt.md');
  return _fill(template, {
    'FULL TASK PROMPT WITH CONCRETE G AND S': taskPrompt,
    'CANDIDATE JSON': candidateAnswer,
  });
}

export function fill_scsg_refiner_prompt(
    taskPrompt, previousCandidate, auditReport) {
  const template =
      _read_template('../docs/prompts/scsg_prompts/scsg_refiner_prompt.md');
  return _fill(template, {
    'FULL TASK PROMPT WITH CONCRETE G AND S': taskPrompt,
    'PREVIOUS CANDIDATE JSON': previousCandidate,
    'AUDIT REPORT JSON': auditReport,
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

function _read_template(relativePath) {
  return readFileSync(path.join(__dirname, relativePath), 'utf8');
}

function _fill(template, inputs) {
  let result = template;
  for (const [key, value] of Object.entries(inputs)) {
    const serialized = (value !== null && typeof value === 'object') ?
        JSON.stringify(value, null, 2) :
        String(value);
    // handle all three placeholder syntaxes
    result = result.replaceAll(`{INSERT ${key}}`, serialized)
                 .replaceAll(`{{${key}}}`, serialized)
                 .replaceAll(`<PASTE ${key}>`, serialized);
    if (result === template) {
      console.warn(`fillPrompt: no placeholder found for key "${key}"`);
    }
  }
  return result;
}