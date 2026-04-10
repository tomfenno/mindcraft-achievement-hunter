import {mkdirSync, readFileSync, writeFileSync} from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


/**
 * Extracts the first JSON object or array from an LLM response string.
 * Handles extra text before/after the JSON and markdown code fences.
 * Returns the parsed object, or null if no valid JSON is found.
 *
 * Example:
 *   const obj = extract_json('Here is the result: {"a": 1} done.');
 *   // obj => { a: 1 }
 *
 *   const obj = extract_json('```json\n{"a": 1}\n```');
 *   // obj => { a: 1 }
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

/**
 * Extracts the first JSON object from an LLM response string and writes
 * it to file_path. Creates parent directories if they don't exist.
 * Returns the parsed object, or null if no valid JSON is found.
 *
 * Example:
 *   const llm_output = await prompter.promptConvo(messages);
 *   const obj = save_json(llm_output, 'achievement_hunter/logs/output.json');
 *   // obj => { ... } or null if extraction failed
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

/**
 * Fills the ptd_prompt template with an objective string.
 * Returns the filled prompt string, ready to send to an LLM.
 *
 * Example:
 *   const prompt = fill_ptd_prompt('Craft a stone pickaxe');
 */
export function fill_ptd_prompt(objective) {
  const template = _read_template('../docs/prompts/ptd_prompts/ptd_prompt.md');
  return _fill(template, {OBJECTIVE: objective});
}

/**
 * Fills the ptd_feedback_prompt template with an objective string and a
 * candidate graph object. Returns the filled prompt string.
 *
 * Example:
 *   const prompt = fill_ptd_feedback_prompt('Craft a stone pickaxe', graph_obj);
 */
export function fill_ptd_feedback_prompt(objective, candidate_graph) {
  const template =
      _read_template('../docs/prompts/ptd_prompts/ptd_feedback_prompt.md');
  return _fill(
      template, {OBJECTIVE: objective, 'CANDIDATE GRAPH': candidate_graph});
}

/**
 * Fills the ptd_refinement_prompt template with an objective string, a
 * candidate graph object, and a validator output object.
 * Returns the filled prompt string.
 *
 * Example:
 *   const prompt = fill_ptd_refinement_prompt('Craft a stone pickaxe', graph_obj, validator_obj);
 */
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

/**
 * Enriches a pruned scsg subgraph using the original full PTD graph:
 *   - Restores item_type and acquisition_dependency to each vertex
 *   - Restores type to each edge
 *   - Adds satisfied_inputs to each vertex: a list of edges from the original
 *     graph that pointed TO that vertex but whose from-vertex was pruned
 *     (already satisfied by the bot's current state)
 *
 * Example:
 *   const trimmed = trim_graph_for_scsg(ptd_graph);
 *   // ... run scsg to get subgraph ...
 *   const enriched = enrich_subgraph(subgraph, ptd_graph);
 *   // each vertex now has satisfied_inputs: [{ from, type, qty, consumed }]
 */
export function enrich_subgraph(subgraph, original_graph) {
  const vertex_map = new Map(original_graph.vertices.map(v => [v.id, v]));
  const edge_map = new Map(
    original_graph.edges.map(e => [`${e.from}->${e.to}:${e.consumed}`, e])
  );
  const subgraph_ids = new Set(subgraph.vertices.map(v => v.id));

  const vertices = subgraph.vertices.map(v => {
    const original = vertex_map.get(v.id);
    if (!original) {
      console.warn(`enrich_subgraph: no original vertex found for id "${v.id}"`);
      return v;
    }

    const satisfied_inputs = original_graph.edges
      .filter(e => e.to === v.id && !subgraph_ids.has(e.from))
      .map(e => ({ from: e.from, type: e.type, qty: e.qty, consumed: e.consumed }));

    return {
      ...v,
      item_type: original.item_type,
      acquisition_dependency: original.acquisition_dependency,
      satisfied_inputs,
    };
  });

  const edges = subgraph.edges.map(e => {
    const original = edge_map.get(`${e.from}->${e.to}:${e.consumed}`);
    if (!original) {
      console.warn(`enrich_subgraph: no original edge found for (${e.from} -> ${e.to}, consumed=${e.consumed})`);
      return e;
    }
    return { ...e, type: original.type };
  });

  return { ...subgraph, vertices, edges };
}

/**
 * Trims a PTD graph down to only the fields required by the scsg prompt,
 * reducing token usage. Keeps objective, sinks, vertex {id, qty}, and
 * edge {from, to, qty, consumed}.
 *
 * Example:
 *   const trimmed = trim_graph_for_scsg(ptd_graph);
 *   const prompt = fill_scsg_prompt(trimmed, state);
 */
export function trim_graph_for_scsg(graph) {
  return {
    objective: graph.objective,
    sinks: graph.sinks,
    vertices: graph.vertices.map(({id, qty}) => ({id, qty})),
    edges: graph.edges.map(({from, to, qty, consumed}) => ({from, to, qty, consumed})),
  };
}

/**
 * Fills the scsg_prompt template with a graph object and a state object.
 * Returns the filled prompt string.
 *
 * Example:
 *   const prompt = fill_scsg_prompt(graph_obj, state_obj);
 */
export function fill_scsg_prompt(graph, state) {
  const template = _read_template('../docs/prompts/scsg_prompts/scsg_prompt.md');
  return _fill(template, {GRAPH: graph, STATE: state});
}

/**
 * Fills the scsg_feedback_prompt template with a task prompt string and a
 * candidate answer object. The task_prompt is typically the output of
 * fill_scsg_prompt. Returns the filled prompt string.
 *
 * Example:
 *   const task_prompt = fill_scsg_prompt(graph_obj, state_obj);
 *   const prompt = fill_scsg_feedback_prompt(task_prompt, candidate_answer_obj);
 */
export function fill_scsg_feedback_prompt(task_prompt, candidate_answer) {
  const template =
      _read_template('../docs/prompts/scsg_prompts/scsg_feedback_prompt.md');
  return _fill(template, {
    'FULL TASK PROMPT WITH CONCRETE G AND S': task_prompt,
    'CANDIDATE JSON': candidate_answer,
  });
}

/**
 * Fills the task_prompt template with an enriched subgraph object and a
 * state object. Returns the filled prompt string.
 *
 * Example:
 *   const prompt = fill_task_prompt(enriched_subgraph_obj, state_obj);
 */
export function fill_task_prompt(enriched_subgraph, state) {
  const template = _read_template('../docs/prompts/task_prompts/task_prompt.md');
  return _fill(template, {'ENRICHED_SUBGRAPH': enriched_subgraph, 'STATE': state});
}

/**
 * Fills the action_mediator prompt template with a task object and a
 * state object. Returns the filled prompt string.
 *
 * Example:
 *   const prompt = fill_action_mediator_prompt(task_obj, state_obj);
 */
export function fill_action_mediator_prompt(task, state) {
  const template = _read_template('../docs/prompts/action_mediator_prompts/action_mediator.md');
  return _fill(template, {'TASK': task, 'STATE': state});
}

/**
 * Fills the next_task_selector prompt template with an enriched subgraph
 * object and a state object. Returns the filled prompt string.
 *
 * Example:
 *   const prompt = fill_next_task_selector_prompt(enriched_subgraph_obj, state_obj);
 */
export function fill_next_task_selector_prompt(enriched_subgraph, state) {
  const template = _read_template('../docs/prompts/next_task_selector_prompts/next_task_selector.md');
  return _fill(template, {'ENRICHED_SUBGRAPH': enriched_subgraph, 'STATE': state});
}

/**
 * Fills the scsg_refiner_prompt template with a task prompt string, a
 * previous candidate object, and an audit report object. The task_prompt
 * is typically the output of fill_scsg_prompt. Returns the filled prompt string.
 *
 * Example:
 *   const task_prompt = fill_scsg_prompt(graph_obj, state_obj);
 *   const prompt = fill_scsg_refiner_prompt(task_prompt, previous_candidate_obj, audit_report_obj);
 */
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
 * Reads a template file relative to this file's directory.
 */
function _read_template(relative_path) {
  return readFileSync(path.join(__dirname, relative_path), 'utf8');
}

/**
 * Replaces {{KEY}} placeholders in a template string with values from inputs.
 * String values are inserted as-is; objects are serialized with JSON.stringify.
 * Warns if a key has no matching placeholder in the template.
 */
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
