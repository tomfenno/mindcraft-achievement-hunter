import {
  extract_json,
  enrich_subgraph,
  fill_action_mediator_prompt,
  fill_next_task_selector_prompt,
  fill_ptd_prompt,
  fill_scsg_prompt,
  get_inventory_state,
  get_state,
  trim_graph_for_scsg,
} from './prompt_utils.js';
import {
  containsCommand,
  executeCommand,
  truncCommandMessage,
} from '../../src/agent/commands/index.js';
import {
  getBlockId,
  getEntityId,
  getItemId,
} from '../../src/utils/mcdata.js';

const STOPPED = 0;
const ACTIVE = 1;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeModelOutput(raw) {
  if (typeof raw !== 'string') {
    return '';
  }

  let cleaned = raw.trim();
  if (cleaned.includes('</think>')) {
    const [_, afterThink] = cleaned.split('</think>');
    cleaned = afterThink.trim();
  }

  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    cleaned = fenced[1].trim();
  }

  return cleaned.trim();
}

function computeSinks(vertices, edges) {
  const outgoing = new Set(edges.map(edge => edge.from));
  return vertices
      .filter(vertex => !outgoing.has(vertex.id))
      .map(vertex => vertex.id);
}

function roundPosition(position = {}) {
  return {
    x: Math.round(position.x ?? 0),
    y: Math.round(position.y ?? 0),
    z: Math.round(position.z ?? 0),
  };
}

function normalizeSnakeCaseId(value) {
  return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
}

export class StructuredPromptingLoop {
  constructor(agent) {
    this.agent = agent;
    this.state = STOPPED;
    this.loop_active = false;
    this.interrupt = false;
    this.prompt = '';
    this.idle_time = 0;
    this.cooldown = 1000;
    this.replan_delay_ms = 500;
    this.task_retry_delay_ms = 300;
    this.max_json_attempts = 2;
    this.max_task_iterations = 10;
    this.max_stall_iterations = 3;
    this.max_search_iterations = 4;

    this.ptd = null;
    this.current_scsg = null;
    this.current_task = null;
    this.last_action = null;
    this.last_error = null;
  }

  isActive() {
    return this.state === ACTIVE;
  }

  isStopped() {
    return this.state === STOPPED;
  }

  async start(prompt) {
    const objective = (prompt || '').trim();
    if (!objective) {
      return 'No structured prompting objective specified.';
    }

    if (this.isActive()) {
      await this.stop();
    }

    if (!this.agent.self_prompter.isStopped()) {
      await this.agent.self_prompter.stop();
    }
    await this.agent.actions.stop();

    this.prompt = objective;
    this.state = ACTIVE;
    this.interrupt = false;
    this.ptd = null;
    this.current_scsg = null;
    this.current_task = null;
    this.last_action = null;
    this.last_error = null;

    this.startLoop();
    return `Structured prompting loop started for goal: "${this.prompt}"`;
  }

  update(delta) {
    if (!this.isActive() || this.loop_active || this.interrupt) {
      this.idle_time = 0;
      return;
    }

    if (this.agent.isIdle()) {
      this.idle_time += delta;
    } else {
      this.idle_time = 0;
    }

    if (this.idle_time >= this.cooldown) {
      this.startLoop();
      this.idle_time = 0;
    }
  }

  async stop(stop_action = true) {
    this.state = STOPPED;
    this.interrupt = true;
    this.current_task = null;
    this.current_scsg = null;
    this.last_action = null;
    if (stop_action) {
      await this.agent.actions.stop();
    }
    await this.stopLoop();
    this.prompt = '';
  }

  async stopLoop() {
    if (!this.loop_active) {
      return;
    }
    while (this.loop_active) {
      await sleep(200);
    }
  }

  async startLoop() {
    if (this.loop_active || !this.isActive()) {
      return;
    }

    this.loop_active = true;
    try {
      await this.runLoop();
    } catch (error) {
      this.last_error = error?.message || String(error);
      console.error('[SPL] Structured prompting loop failed:', error);
      this.agent.openChat(`Structured prompting loop failed: ${this.last_error}`);
      this.state = STOPPED;
    } finally {
      this.loop_active = false;
      this.interrupt = false;
    }
  }

  async runLoop() {
    if (!this.ptd) {
      this.ptd = await this.generatePtd(this.prompt);
      console.log('[SPL] Generated PTD.');
    }

    while (this.isActive() && !this.interrupt) {
      const inventory_state = get_inventory_state(this.agent);
      const scsg_response = await this.generateScsg(this.ptd, inventory_state);
      const scsg = this.normalizeScsg(scsg_response, this.ptd);
      this.current_scsg = scsg;

      if (scsg.vertices.length === 0) {
        this.state = STOPPED;
        this.current_task = null;
        this.agent.openChat(`Structured prompting goal complete: ${this.prompt}`);
        return;
      }

      const state = get_state(this.agent);
      const enriched_subgraph = enrich_subgraph(scsg, this.ptd);
      const task = await this.selectNextTask(enriched_subgraph, state);
      this.current_task = task;
      console.log('[SPL] Selected task:', JSON.stringify(task));

      const task_status = await this.executeTaskLoop(task);
      console.log(`[SPL] Task loop ended with status: ${task_status}`);

      if (!this.isActive() || this.interrupt) {
        return;
      }

      await sleep(this.replan_delay_ms);
    }
  }

  async generatePtd(objective) {
    const prompt = fill_ptd_prompt(objective);
    const raw_ptd = await this.requestJson(prompt, 'structured_ptd');
    return this.normalizeGraph(raw_ptd, objective);
  }

  async generateScsg(ptd, inventory_state) {
    const trimmed_graph = trim_graph_for_scsg(ptd);
    const prompt = fill_scsg_prompt(trimmed_graph, inventory_state);
    return await this.requestJson(prompt, 'structured_scsg');
  }

  async selectNextTask(enriched_subgraph, state) {
    const prompt = fill_next_task_selector_prompt(enriched_subgraph, state);
    const task = this.normalizeTask(
        await this.requestJson(prompt, 'structured_next_task'));
    if (!task?.action_type) {
      throw new Error('Next-task selector returned an invalid task object.');
    }
    return task;
  }

  async mediateAction(task, state) {
    const prompt = fill_action_mediator_prompt(task, state);
    const raw = await this.agent.prompter.promptStructured(
        prompt, 'structured_action_mediator');
    const cleaned = sanitizeModelOutput(raw);
    const maybe_json = extract_json(cleaned);
    if (maybe_json?.status === 'TASK_COMPLETE') {
      return maybe_json;
    }
    if (!containsCommand(cleaned)) {
      return cleaned;
    }
    return truncCommandMessage(cleaned);
  }

  async requestJson(prompt, tag) {
    let raw = '';
    for (let attempt = 0; attempt < this.max_json_attempts; attempt++) {
      const suffix = attempt === 0 ?
        '' :
        '\n\nReturn only valid JSON. Do not include prose or markdown fences.';
      raw = await this.agent.prompter.promptStructured(prompt + suffix, tag);
      const parsed = extract_json(raw);
      if (parsed !== null) {
        return parsed;
      }
    }
    throw new Error(`Model did not return valid JSON for ${tag}: ${raw}`);
  }

  normalizeGraph(graph, default_objective = null) {
    if (!graph || !Array.isArray(graph.vertices) || !Array.isArray(graph.edges)) {
      throw new Error('Structured prompt returned an invalid graph.');
    }

    const normalized = deepClone(graph);
    normalized.objective = normalized.objective || default_objective || this.prompt;

    const vertex_map = new Map();
    for (const vertex of normalized.vertices) {
      const id = this.canonicalizeItemId(vertex?.id);
      if (!id) {
        continue;
      }
      const current = vertex_map.get(id);
      const canonical_vertex = {
        ...vertex,
        id,
      };
      if (!current) {
        vertex_map.set(id, canonical_vertex);
        continue;
      }

      current.qty = Math.max(current.qty || 0, canonical_vertex.qty || 0);
      current.item_type = current.item_type || canonical_vertex.item_type;
      current.acquisition_dependency =
          current.acquisition_dependency || canonical_vertex.acquisition_dependency;
    }

    const valid_vertex_ids = new Set(vertex_map.keys());
    const merged_edges = new Map();
    for (const edge of normalized.edges) {
      const from = this.canonicalizeItemId(edge?.from);
      const to = this.canonicalizeItemId(edge?.to);
      if (!from || !to || !valid_vertex_ids.has(from) || !valid_vertex_ids.has(to)) {
        continue;
      }
      const key = `${from}|${to}|${edge.type}|${edge.consumed}`;
      if (!merged_edges.has(key)) {
        merged_edges.set(key, {
          ...edge,
          from,
          to,
        });
        continue;
      }

      const existing = merged_edges.get(key);
      existing.qty = Math.max(existing.qty || 0, edge.qty || 0);
    }

    const vertices = Array.from(vertex_map.values());
    const edges = Array.from(merged_edges.values());

    const reusable_targets = new Set(
        edges.filter(edge => !edge.consumed).map(edge => edge.from));
    for (const vertex of vertices) {
      if ((vertex.item_type === 'tool' || vertex.item_type === 'workstation') &&
          reusable_targets.has(vertex.id) &&
          !normalized.sinks?.includes(vertex.id)) {
        vertex.qty = 1;
      }
    }

    const sinks = Array.isArray(normalized.sinks) && normalized.sinks.length > 0 ?
      normalized.sinks
          .map(sink => this.canonicalizeItemId(sink))
          .filter(sink => sink && valid_vertex_ids.has(sink)) :
      computeSinks(vertices, edges);

    return {
      objective: normalized.objective,
      sinks: sinks.length > 0 ? sinks : computeSinks(vertices, edges),
      vertices,
      edges,
    };
  }

  normalizeScsg(scsg_response, ptd) {
    const final_graph = scsg_response?.final || scsg_response;
    if (!final_graph || !Array.isArray(final_graph.vertices) ||
        !Array.isArray(final_graph.edges)) {
      throw new Error('SCSG response did not include a final graph.');
    }

    const vertex_ids = new Set(ptd.vertices.map(vertex => vertex.id));
    const vertices = final_graph.vertices
        .map(vertex => ({
          ...vertex,
          id: this.canonicalizeItemId(vertex?.id),
        }))
        .filter(vertex => vertex.id && vertex_ids.has(vertex.id));
    const allowed_ids = new Set(vertices.map(vertex => vertex.id));
    const edges = final_graph.edges
        .map(edge => ({
          ...edge,
          from: this.canonicalizeItemId(edge?.from),
          to: this.canonicalizeItemId(edge?.to),
        }))
        .filter(edge =>
          edge.from && edge.to &&
          allowed_ids.has(edge.from) &&
          allowed_ids.has(edge.to));

    return {
      objective: ptd.objective,
      sinks: computeSinks(vertices, edges),
      vertices,
      edges,
    };
  }

  async executeTaskLoop(task) {
    let last_action = null;
    let stall_iterations = 0;
    let search_step = 0;
    const max_iterations =
        task.action_type === 'search' ?
        Math.max(task.parameters?.radius_sequence?.length || 0,
            this.max_search_iterations) :
        this.max_task_iterations;

    for (let iteration = 0;
         iteration < max_iterations && this.isActive() && !this.interrupt;
         iteration++) {
      const state = get_state(this.agent);
      if (this.isTaskComplete(task, state)) {
        return 'success';
      }

      const mediator_task = this.getMediatorTask(task, search_step);
      const action = await this.mediateAction(mediator_task, state);
      this.last_action = action;

      if (action?.status === 'TASK_COMPLETE') {
        if (this.isTaskComplete(task, state)) {
          return 'success';
        }
        console.warn('[SPL] Ignoring premature TASK_COMPLETE signal:', task);
        return 'fail';
      }

      if (this.isTaskComplete(task, state)) {
        return 'success';
      }

      if (typeof action !== 'string' || !containsCommand(action)) {
        console.warn('[SPL] Action mediator returned invalid output:', action);
        return 'fail';
      }

      const before_signature = this.getProgressSignature(state, task);
      const result = await executeCommand(this.agent, action);
      const next_state = get_state(this.agent);

      if (this.isTaskComplete(task, next_state)) {
        return 'success';
      }

      const after_signature = this.getProgressSignature(next_state, task);
      const explicit_failure = this.isExplicitFailure(result);
      if ((action === last_action && before_signature === after_signature) ||
          explicit_failure) {
        stall_iterations++;
      } else {
        stall_iterations = 0;
      }

      if (stall_iterations >= this.max_stall_iterations) {
        return 'fail';
      }

      if (task.action_type === 'search' &&
          Array.isArray(task.parameters?.radius_sequence) &&
          search_step < task.parameters.radius_sequence.length - 1) {
        search_step++;
      }

      last_action = action;
      if (after_signature === before_signature && task.action_type === 'search' &&
          search_step >= (task.parameters?.radius_sequence?.length || 1) - 1) {
        stall_iterations++;
      }

      await sleep(this.task_retry_delay_ms);
    }

    return 'fail';
  }

  getMediatorTask(task, search_step) {
    if (task.action_type !== 'search') {
      return task;
    }

    const task_copy = deepClone(task);
    const radii = task_copy.parameters?.radius_sequence || [];
    if (radii.length === 0) {
      return task_copy;
    }

    const start_index = Math.min(search_step, radii.length - 1);
    task_copy.parameters.radius_sequence = radii.slice(start_index);
    return task_copy;
  }

  normalizeTask(task) {
    if (!task || typeof task !== 'object') {
      return task;
    }

    const normalized = deepClone(task);
    if (normalized.target_item) {
      normalized.target_item = this.canonicalizeItemId(normalized.target_item);
    }

    if (normalized.parameters?.crafting_inputs) {
      normalized.parameters.crafting_inputs = normalized.parameters.crafting_inputs.map(
          input => ({
            ...input,
            item: this.canonicalizeItemId(input?.item),
          }));
    }

    if (normalized.parameters?.smelting_inputs) {
      normalized.parameters.smelting_inputs = normalized.parameters.smelting_inputs.map(
          input => ({
            ...input,
            item: this.canonicalizeItemId(input?.item),
          }));
    }

    if (normalized.parameters?.fuel_inputs) {
      normalized.parameters.fuel_inputs = normalized.parameters.fuel_inputs.map(
          input => ({
            ...input,
            item: this.canonicalizeItemId(input?.item),
          }));
    }

    if (typeof normalized.parameters?.workstation === 'string') {
      normalized.parameters.workstation =
          this.canonicalizeItemId(normalized.parameters.workstation);
    }
    if (typeof normalized.parameters?.tool === 'string') {
      normalized.parameters.tool = this.canonicalizeItemId(normalized.parameters.tool);
    }
    if (typeof normalized.parameters?.item_dependency === 'string') {
      normalized.parameters.item_dependency =
          this.canonicalizeItemId(normalized.parameters.item_dependency);
    }

    if (Array.isArray(normalized.parameters?.targets)) {
      normalized.parameters.targets = normalized.parameters.targets.map(target => ({
        ...target,
        target: this.canonicalizeSearchTarget(target?.target),
      }));
    }

    return normalized;
  }

  isTaskComplete(task, state) {
    if (!task || !state) {
      return false;
    }

    if (task.action_type === 'search') {
      const targets = task.parameters?.targets || [];
      return targets.some(({target}) => this.hasSearchEvidence(state, target));
    }

    if (!task.target_item || typeof task.qty !== 'number') {
      return false;
    }

    return this.getInventoryCount(state.inventory, task.target_item) >= task.qty;
  }

  hasSearchEvidence(state, target) {
    if (!target || !state) {
      return false;
    }

    if (state.nearby_entities?.mobs?.[target] > 0) {
      return true;
    }

    if (state.nearby_blocks?.includes(target)) {
      return true;
    }

    if (target === 'water' || target === 'lava') {
      if (state.relative_blocks?.below === target ||
          state.relative_blocks?.legs === target ||
          state.relative_blocks?.head === target ||
          state.relative_blocks?.above_head_solid === target) {
        return true;
      }
    }

    if (getEntityId(target) != null) {
      return state.nearby_entities?.mobs?.[target] > 0;
    }

    if (getBlockId(target) != null) {
      return state.nearby_blocks?.includes(target);
    }

    return false;
  }

  getInventoryCount(inventory, item_id) {
    const canonical_id = this.canonicalizeItemId(item_id);
    if (!inventory || inventory === 'Nothing') {
      return 0;
    }

    if (!canonical_id?.startsWith('any_')) {
      return inventory[canonical_id] || 0;
    }

    if (canonical_id === 'any_log') {
      return Object.entries(inventory)
          .filter(([name]) =>
            name.endsWith('_log') ||
            name.endsWith('_stem') ||
            name.endsWith('_hyphae'))
          .reduce((sum, [_, count]) => sum + count, 0);
    }

    if (canonical_id === 'any_plank') {
      return Object.entries(inventory)
          .filter(([name]) => name.endsWith('_planks'))
          .reduce((sum, [_, count]) => sum + count, 0);
    }

    return 0;
  }

  canonicalizeItemId(item_id) {
    const normalized_id = normalizeSnakeCaseId(item_id);
    const aliases = {
      log: 'any_log',
      logs: 'any_log',
      plank: 'any_plank',
      planks: 'any_plank',
      wood_log: 'any_log',
      wood_logs: 'any_log',
      wood_plank: 'any_plank',
      wood_planks: 'any_plank',
    };
    const candidate = aliases[normalized_id] || normalized_id;

    if (candidate.startsWith('any_')) {
      return candidate;
    }

    return getItemId(candidate) != null ? candidate : normalized_id;
  }

  canonicalizeSearchTarget(target) {
    const normalized = normalizeSnakeCaseId(target);
    const aliases = {
      any_log: 'oak_log',
      log: 'oak_log',
      logs: 'oak_log',
      any_plank: 'oak_log',
      plank: 'oak_log',
      planks: 'oak_log',
    };
    return aliases[normalized] || normalized;
  }

  getProgressSignature(state, task) {
    const mobs = state.nearby_entities?.mobs || {};
    const signature = {
      action_type: task.action_type,
      target_count: task.target_item ?
        this.getInventoryCount(state.inventory, task.target_item) :
        null,
      nearby_blocks: [...(state.nearby_blocks || [])].sort(),
      mobs: Object.keys(mobs).sort().reduce(
          (acc, key) => {
            acc[key] = mobs[key];
            return acc;
          }, {}),
      position: roundPosition(state.position),
    };

    if (task.action_type === 'search') {
      signature.search_targets =
          (task.parameters?.targets || []).map(target => target.target);
    }

    return JSON.stringify(signature);
  }

  isExplicitFailure(result) {
    if (result == null) {
      return false;
    }

    const text = String(result).toLowerCase();
    return text.includes('error:') ||
      text.includes('invalid ') ||
      text.includes('does not exist') ||
      text.includes('my brain disconnected') ||
      text.includes('could not find') ||
      text.includes('no path') ||
      text.includes('failed');
  }
}
