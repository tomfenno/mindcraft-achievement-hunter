import { selectAPI, createModel } from '../models/_model_map.js';

function extractJson(text) {
    if (!text || typeof text !== 'string') {
        throw new Error('Model response was empty or not a string.');
    }

    try {
        return JSON.parse(text);
    } catch (_) {}

    const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
    if (fenced) {
        try {
            return JSON.parse(fenced[1].trim());
        } catch (_) {}
    }

    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const candidate = text.slice(firstBrace, lastBrace + 1);
        try {
            return JSON.parse(candidate);
        } catch (_) {}
    }

    throw new Error(`Failed to parse JSON from model response:\n${text}`);
}

function normalizeArtifact(raw, goal) {
    const nodes = Array.isArray(raw?.candidate_nodes) ? raw.candidate_nodes : [];

    return {
        task: raw?.task || goal,
        candidate_nodes: nodes.map((node, idx) => {
            if (typeof node === 'string') {
                return {
                    id: `n${idx + 1}`,
                    label: node,
                    status: 'pending'
                };
            }

            return {
                id: node?.id || `n${idx + 1}`,
                label: node?.label || `node_${idx + 1}`,
                status: node?.status || 'pending'
            };
        }),
        notes: raw?.notes || ''
    };
}

function applyNodeUpdates(artifact, updates) {
    if (!artifact || !Array.isArray(artifact.candidate_nodes)) return artifact;
    if (!Array.isArray(updates)) return artifact;

    const updateMap = new Map();
    for (const update of updates) {
        if (!update?.id) continue;
        updateMap.set(update.id, update);
    }

    artifact.candidate_nodes = artifact.candidate_nodes.map(node => {
        const update = updateMap.get(node.id);
        if (!update) return node;

        return {
            ...node,
            status: update.status || node.status
        };
    });

    return artifact;
}

export class TwoStagePipeline {
    constructor(agent, profile) {
        this.agent = agent;
        this.profile = profile;

        const plannerSpec = selectAPI(profile.planner_model || profile.model);
        const selectorSpec = selectAPI(profile.selector_model || profile.model);

        this.plannerModel = createModel(plannerSpec);
        this.selectorModel = createModel(selectorSpec);
    }

    getRecentHistory(limit = 8) {
        try {
            const history = this.agent.history.getHistory();
            return history.slice(-limit).map(turn => ({
                role: turn.role,
                content: turn.content
            }));
        } catch (err) {
            console.warn('Failed to read recent history:', err);
            return [];
        }
    }

    getInventorySummary() {
        try {
            const items = this.agent.bot.inventory.items();
            const counts = {};
            for (const item of items) {
                counts[item.name] = (counts[item.name] || 0) + item.count;
            }
            return counts;
        } catch (err) {
            console.warn('Failed to read inventory:', err);
            return {};
        }
    }

    getNearbyBlockSummary(maxBlocks = 12, maxDistance = 16) {
        try {
            const origin = this.agent.bot.entity.position;
            const blocks = [];
            const seen = new Set();

            for (let dx = -maxDistance; dx <= maxDistance; dx++) {
                for (let dy = -4; dy <= 4; dy++) {
                    for (let dz = -maxDistance; dz <= maxDistance; dz++) {
                        const pos = origin.offset(dx, dy, dz);
                        const block = this.agent.bot.blockAt(pos);
                        if (!block || !block.name || block.name === 'air') continue;
                        if (seen.has(block.name)) continue;

                        seen.add(block.name);
                        blocks.push(block.name);

                        if (blocks.length >= maxBlocks) return blocks;
                    }
                }
            }

            return blocks;
        } catch (err) {
            console.warn('Failed to read nearby blocks:', err);
            return [];
        }
    }

    buildStateSummary() {
        return {
            health: this.agent.bot?.health ?? null,
            food: this.agent.bot?.food ?? null,
            position: this.agent.bot?.entity?.position
                ? {
                    x: Number(this.agent.bot.entity.position.x.toFixed(2)),
                    y: Number(this.agent.bot.entity.position.y.toFixed(2)),
                    z: Number(this.agent.bot.entity.position.z.toFixed(2))
                }
                : null,
            inventory: this.getInventorySummary(),
            nearby_blocks: this.getNearbyBlockSummary(),
            recent_history: this.getRecentHistory()
        };
    }

    async runStageA(goal) {
        const plannerSystemPrompt = `
You are Stage A in a two-stage Minecraft planning pipeline.

Your job:
- read the overall task goal
- produce a SMALL structured planning artifact
- do NOT output commands
- do NOT explain outside JSON

Return JSON with exactly this schema:
{
  "task": "string",
  "candidate_nodes": [
    {
      "id": "n1",
      "label": "string",
      "status": "pending"
    }
  ],
  "notes": "string"
}

Rules:
- produce between 3 and 6 nodes when possible
- each node should represent a short progression step
- every node status must initially be "pending"
- JSON only
        `.trim();

        const plannerMessages = [
            {
                role: 'user',
                content: JSON.stringify({ goal }, null, 2)
            }
        ];

        const plannerRaw = await this.plannerModel.sendRequest(plannerMessages, plannerSystemPrompt);
        const rawArtifact = extractJson(plannerRaw);
        return normalizeArtifact(rawArtifact, goal);
    }

    async runStageB(artifact, lastActionResult = null) {
        const state = this.buildStateSummary();

        const selectorSystemPrompt = `
You are Stage B in a two-stage Minecraft planning pipeline.

Your job:
- inspect the planning artifact
- inspect the current Minecraft state
- inspect the latest action result if provided
- mark any nodes complete or in_progress when justified
- choose the BEST next node to pursue right now

Return JSON with exactly this schema:
{
  "selected_node_id": "string",
  "selected_node_label": "string",
  "reason": "string",
  "action_hint": "string",
  "node_updates": [
    {
      "id": "string",
      "status": "pending | in_progress | complete"
    }
  ]
}

Rules:
- selected_node_id must be one of the nodes that is not complete
- selected_node_label must match the selected node
- node_updates should only include nodes whose status should change
- use only: pending, in_progress, complete
- if all nodes are complete, return selected_node_id as "none" and selected_node_label as "none"
- JSON only
        `.trim();

        const selectorMessages = [
            {
                role: 'user',
                content: JSON.stringify({
                    artifact,
                    state,
                    last_action_result: lastActionResult
                }, null, 2)
            }
        ];

        const selectorRaw = await this.selectorModel.sendRequest(selectorMessages, selectorSystemPrompt);
        const stageB = extractJson(selectorRaw);

        return {
            state,
            stageB
        };
    }

    applyStageBResult(artifact, stageB) {
        return applyNodeUpdates(artifact, stageB?.node_updates || []);
    }
}