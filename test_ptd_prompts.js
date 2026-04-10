import { GPT } from './src/models/gpt.js';
import fs from 'fs'; // Node's file system module to save logs

const llm = new GPT("gpt-4o-mini", null, { temperature: 0.3 });

// DogNamedMud's Prompts (Truncated here for readability, paste the full text from Discord in your actual file)
const TASK_PROMPT = `Construct a Directed Acyclic Graph G: a dependency chain required to achieve objective O from a fresh survival start in Minecraft Java Edition 1.21.6.

## Vertices
Vertices must be inventory items only, never actions, locations, or game events.

Vertex fields:
- id: Minecraft Java Edition 1.21.6 inventory item, lowercase snake_case
- qty: total quantity produced or gathered
- item_type: resource | item | tool | workstation
- acquisition_dependency: water_source | lava_source | mob | none

### acquisition_dependency
acquisition_dependency is vertex-local and describes the non-inventory world interaction required to obtain that vertex.

Rules:
- It applies only to obtaining that item itself, not any later use of that item.
- Use it only for required world interactions not represented by inventory-item vertices.
- If obtaining the item also requires another inventory item, represent that inventory-item requirement as an explicit dependency vertex and edge.
- If world interaction transforms item A into item B, model B as a separate vertex.
- Never inherit acquisition_dependency from a consumer.

Examples:
- bucket -> none
- water_bucket -> water_source
- lava_bucket -> lava_source
- bone -> mob
- porkchop -> mob

### Vertex classification examples
- any_log -> resource
- cobblestone -> resource
- raw_iron -> resource
- any_plank -> item
- stick -> item
- iron_ingot -> item

## Edges
A -> B means A is required for B.

Edge fields:
- from: source vertex id
- to: target vertex id
- type: crafting_input | smelting_input | fuel_input | item_dependency | tool_dependency | workstation_dependency
- qty: total from quantity used by to
- consumed: false only for item_dependency, tool_dependency, and workstation_dependency; otherwise true

Use workstation_dependency only when the prerequisite is a workstation required to craft or process the target.
Use item_dependency only when the prerequisite is a reusable inventory item required to obtain, craft, process, or transform the target, but is not consumed into the target.

### Transformation examples
- bucket -> water_bucket:
  - water_bucket.acquisition_dependency = water_source
  - edge bucket -> water_bucket has type = crafting_input
  - consumed = true
- bucket -> lava_bucket:
  - lava_bucket.acquisition_dependency = lava_source
  - edge bucket -> lava_bucket has type = crafting_input
  - consumed = true
- water_bucket -> obsidian:
  - obsidian.acquisition_dependency = lava_source
  - edge water_bucket -> obsidian has type = item_dependency
  - consumed = false

## Sinks
In final G, each sink is one required objective inventory item.

Rules:
- Set qty at creation.
- If the objective requires multiple items, create one sink per item.
- If the objective is to obtain a transformed item, the sink must be the final transformed inventory item, not an intermediate prerequisite item.

## Resource Rules
- Include all required intermediate items.
- Include required tools, fuel, and workstations.
- Represent required workstations with workstation_dependency. Workstations are not consumed.
- Represent required tools with tool_dependency. Tools are not consumed.
- Each smelted output requires smelting_input, fuel_input, and workstation_dependency.
- Fuel vertices are acquired inventory items.
- fuel_input.qty is the number of fuel item units actually consumed by smelting.
- Recipes craftable in the 2x2 inventory grid do not require crafting_table.

## Quantity Rules
- Do not use fractional crafts.
- Respect recipe output batch sizes.

For each vertex produced by a recipe or processing step with fixed output size:
- required = sum of outgoing consumed edge qty
- produced = batch_output * crafts
- Choose the smallest integer crafts such that produced >= required.

Constraints:
- Overproduction is allowed only when forced by recipe batch size.
- Non-consumed dependencies are not multiplied by repeated use unless multiple copies are explicitly required.
- Sink quantities are fixed by the objective and are not reduced to recipe batch minima.

Example:
- stick: 2 planks -> 4 sticks
  - need 4 -> 1 craft ✓
  - need 5 -> 2 crafts ✓
  - need 4 -> 2 crafts ✗

Aggregate-demand example:
- If any_plank is consumed by:
  - crafting_table: 4
  - stick: 2
  - wooden_pickaxe: 3
- then total required outgoing consumed demand is 4 + 2 + 3 = 9
- if any_plank is produced in batches of 4, the minimum valid qty is 12, not 8

## Abstract Resource Convention
- Use the any_ prefix for a class of interchangeable resource items.
- An any_ vertex means any valid in-game equivalent satisfies that requirement.
- Use any_ only when the grouped variants are truly interchangeable for the specific recipe or dependency.

Examples:
- oak_log -> any_log
- oak_plank -> any_plank

## Assumptions
- Use Minecraft Java Edition 1.21.6 mechanics, recipes, and drops.
- Assume a new survival world with no preexisting inventory, storage, infrastructure, or placed workstations.
- Do not rely on loot, trading, naturally generated structures, or chance-dependent shortcuts unless explicitly required.

## Constraints
- Represent every required dependency explicitly as a vertex and edge.
- Vertex id values must be unique.
- If the same item is required in multiple places, use one shared vertex for that id and aggregate its required quantity instead of creating duplicate vertices.
- Every edge from and to value must reference an existing vertex id.
- Every sink must have no outgoing edges.
- All vertex id values must use lowercase snake_case.
- Do not create duplicate edges. For any (from, to, type) combination, there must be at most one edge in G.

## Consistency
- The graph must be acyclic.
- For every vertex, qty must be >= the sum of its outgoing consumed edge quantities.

## Procedure
Construct G by reasoning in two phases: structural expansion first, quantity resolution second.

### 1. Interpret the objective
Convert objective O into one or more sink requests (id, qty).

Rules:
- If O explicitly names inventory items, use those items and requested quantities.
- If O describes an action or event, map it to the required inventory items and quantities.
- If O names a category or set, create one sink request per required member.
- If interpretation is ambiguous, choose the narrowest valid inventory-item set that satisfies O.

### 2. Seed sink vertices
For each sink request (id, qty):
- Create a sink vertex with that id and qty.
- Add it to G.vertices.
- Mark it as a sink in G.sinks.

### 3. Expand prerequisites until complete
Recursively expand every sink and newly added prerequisite vertex until every required prerequisite in G is represented by a valid vertex and edge.

For each vertex v:
- Determine its structural prerequisites.
- For each prerequisite (id, qty):
  - Reuse the existing vertex with that id, or create a new prerequisite vertex with provisional qty = 1.
  - Add the dependency edge from the prerequisite vertex to v using the seed edge quantity only if no edge with the same (from, to, type) already exists.

Rules:
- Prerequisite quantities at this stage are seed quantities only.
- Final vertex and edge quantities are resolved later.
- When multiple valid prerequisite sets exist, choose any valid and achievable set.
- Prefer simple, standard, survival-obtainable prerequisite sets.
- If a recipe cannot be crafted in the 2x2 inventory grid, include crafting_table as a workstation_dependency.
- Do not stop expansion while any vertex in G still lacks a required prerequisite vertex or edge.
- If a gathered or dropped item requires a tool to obtain, model the gathered item itself as the vertex and connect the required tool with tool_dependency.
- Never create action vertices for mining, harvesting, killing, or collecting.
- When multiple valid prerequisite sets exist, prefer the minimally sufficient set for the target requirement; do not introduce a stronger prerequisite tier unless it is actually required.

### 4. Infer vertex and edge metadata during construction
For each created vertex:
- Set item_type from the vertex’s role:
  - tool if it is a reusable tool
  - workstation if it is a workstation
  - resource if it is gathered directly from the world
  - item if it is produced, crafted, smelted, or otherwise transformed from other inventory items
- Set acquisition_dependency from the world interaction required to obtain that item:
  - water_source if obtaining the item requires interacting with a water source
  - lava_source if obtaining the item requires interacting with a lava source
  - mob if obtaining the item requires acquiring it directly from a mob
  - none otherwise

For each created edge:
- Infer type from the relationship between prerequisite and dependent:
  - crafting_input if a is an ingredient in b’s recipe-based inventory transformation, including 2x2, 3x3, and simple conversion recipes
  - smelting_input if a is smelted into b
  - fuel_input if a is used as fuel to produce b
  - item_dependency if a is a reusable inventory item required to obtain, craft, process, or transform b, but is not consumed into b
  - tool_dependency if a is a tool required to obtain, craft, or process b
  - workstation_dependency if a is a workstation required to craft or process b
- Set consumed = true only for crafting_input, smelting_input, and fuel_input. Otherwise set consumed = false.

### 5. Resolve quantities after the full structure exists
Do not return a graph with provisional or unresolved quantities.
Before resolving quantities, verify that structural expansion is complete: no vertex in G may still be missing a required prerequisite vertex or edge.
Once the full DAG structure is complete, resolve quantities in reverse topological order.

First resolve vertex quantities:
- For each non-sink vertex with item_type in {item, resource}:
  - Let required be the sum of outgoing consumed edge quantities.
  - If v is produced in G by a recipe or processing step with fixed output size, set qty to the smallest batch-valid quantity that satisfies required.
  - Otherwise set qty = required.

Then resolve consumed edge quantities:
- For each consumed edge into target vertex t:
  - If e.type = fuel_input, set e.qty to the number of fuel item units actually consumed by the smelting required to produce t.
  - Otherwise set e.qty to the number of e.from units required per craft or processing step of t, multiplied by the number of crafts needed for t.

After quantity resolution, perform a full consistency check over the finished graph.

Rules:
- Non-consumed edge quantities remain unchanged.
- fuel_input.qty measures actual fuel consumption.
- Batch-produced vertices must use the smallest batch-valid quantity that satisfies demand.
- Quantity resolution is complete only when every vertex satisfies qty >= sum(outgoing consumed edge qty).
- If any vertex fails that check, continue resolving until the graph satisfies it.

### 6. Return the final graph
Return G only after all of the following are true:
- every required prerequisite is represented in G
- no vertex in G is missing a required prerequisite vertex or edge
- every vertex satisfies qty >= sum(outgoing consumed edge qty)
- all quantities are final, not provisional
- no duplicate edges exist; every (from, to, type) combination appears at most once

Return the completed G.

## Output
Return exactly one JSON object G with this structure:
{
  "objective": "<objective_string>",
  "sinks": ["<sink_vertex_id>"],
  "vertices": [
    {
      "id": "<vertex_id>",
      "qty": <integer>,
      "item_type": "<resource|item|tool|workstation>",
      "acquisition_dependency": "<water_source|lava_source|mob|none>"
    }
  ],
  "edges": [
    {
      "from": "<vertex_id>",
      "to": "<vertex_id>",
      "type": "<crafting_input|smelting_input|fuel_input|item_dependency|tool_dependency|workstation_dependency>",
      "qty": <integer>,
      "consumed": <true|false>
    }
  ]
}
  
IMPORTANT: DO NOT use markdown code blocks. DO NOT include "json" or backticks. Return ONLY the raw JSON string starting with { and ending with }. Workstations (furnace, crafting_table) must be crafted from their standard survival resources (cobblestone, any_plank). 
IMPORTANT: Do not use the output of a workstation as an input for the workstation itself.`;




























const VALIDATOR_PROMPT = `You are a strict validator for a Minecraft objective-dependency DAG.

Your job is to audit a candidate JSON graph against the provided specification.

Audit requirements:
- Do not generate a new graph.
- Do not rewrite the candidate graph.
- Only analyze it.
- Be exhaustive.
- Prefer concrete rule violations over stylistic preferences.
- Distinguish definite errors from possible issues.
- Use the validation specification as the source of truth.
- Do not mark a graph incorrect solely because another valid graph could also satisfy the objective.

Check all of the following:

1. Output contract
- Top-level keys are exactly correct.
- objective matches the input objective exactly.
- sinks is an array of sink vertex ids.
- All required vertex and edge fields are present.
- No extra prose, markdown, citations, malformed JSON content, or non-JSON text is present.

2. Graph structure
- Graph is acyclic.
- Every sink exists in vertices.
- Every sink has no outgoing edges.
- Every edge endpoint references an existing vertex id.
- Vertex ids are unique.
- No duplicate edges exist for the same (from, to, type).

3. Vertex semantics
- item_type is correct for each vertex.
- acquisition_dependency is correct and vertex-local.
- Vertices are inventory items only.
- No actions, locations, or game events appear as vertices.

4. Edge semantics
- Edge type is correct for the relationship.
- consumed matches edge type rules.
- Reusable prerequisites are modeled with non-consumed dependency edges where appropriate.
- Smelting outputs include smelting_input, fuel_input, and workstation_dependency.
- Workstations and tools are not consumed.
- item_dependency is used only for reusable inventory-item prerequisites that are not consumed.

5. Quantity semantics
- No fractional crafts are implied.
- Batch-size rules are respected.
- For every vertex, qty >= sum(outgoing consumed edge qty).
- Non-consumed dependencies are not multiplied unless multiple copies are explicitly required.
- fuel_input.qty must be consistent with the smelting requirement it supports.
- Do not treat cross-target fuel pooling as a definite requirement unless the validation specification explicitly requires global fuel aggregation across all smelting tasks.
- Shared intermediates use aggregated demand correctly.

6. Objective correctness
- Sinks correctly represent the objective.
- Required prerequisites are complete.
- If the validation specification explicitly requires minimally sufficient prerequisites, check that no unnecessary stronger prerequisite tier is introduced. Otherwise do not treat non-minimal but valid prerequisites as a definite error.

Output format:
Return JSON only with this structure:

{
  "verdict": "pass|fail",
  "definite_issues": [
    {
      "id": "<stable_issue_id>",
      "severity": "high|medium|low",
      "rule_area": "<output|structure|vertex|edge|quantity|objective>",
      "message": "<specific issue>",
      "evidence": "<concise concrete evidence from the graph>",
      "suggested_fix": "<minimal correction>"
    }
  ],
  "possible_issues": [
    {
      "rule_area": "<area>",
      "message": "<possible issue>",
      "evidence": "<why it may be an issue>"
    }
  ],
  "summary": "<short overall assessment>"
}

Rules for auditing:
- If there are no definite issues, set verdict to pass.
- If any definite issue exists, set verdict to fail.
- Do not propose broad redesigns.
- Suggest only local fixes.
- Do not output chain-of-thought.
- Do not mark fuel allocation across multiple distinct smelting targets as a definite error unless the validation specification explicitly requires global fuel aggregation before rounding fuel-item consumption.

## Validation Spec
Validate candidate JSON graph G for objective O under Minecraft Java Edition 1.21.6 survival-start rules.

### Output Contract
G must be exactly one JSON object with top-level keys:
- objective
- sinks
- vertices
- edges

### Vertices
Vertices must be inventory items only.
Required fields: id, qty, item_type, acquisition_dependency.

### Edges
Required fields: from, to, type, qty, consumed.
Allowed types: crafting_input, smelting_input, fuel_input, item_dependency, tool_dependency, workstation_dependency.

### Smelting Rules
Every smelted output requires: smelting_input, fuel_input, and workstation_dependency.

### Quantity Rules
No fractional crafts. Respect batch sizes. Overproduction allowed only when forced by batch size. For every vertex: qty >= sum(outgoing consumed edge qty).

Verify Mass Conservation: For every transformation (crafting/smelting), the sum of qty in the source vertices (considering recipe ratios) must be sufficient to produce the target vertex qty. Mark as 'high' severity if ore qty < ingot qty.`;




















// Generate test cases

const REFINER_PROMPT = `You are a conservative graph refiner for a Minecraft objective-dependency DAG.

Your job is to minimally repair a candidate JSON graph using:
1. the validation specification
2. the original objective
3. the current candidate graph
4. a validator output containing definite and possible issues

Your goal is to produce a corrected graph that satisfies the validation specification while preserving all valid parts of the candidate graph whenever possible. If a sink requires a specific tool to be acquired (e.g., Diamond Pickaxe for Obsidian, String for Fishing Rod), you are EXPLICITLY REQUIRED to build the full prerequisite tree back to raw resources.

Refinement requirements:
- Use the validation specification as the source of truth.
- Treat all definite_issues as authoritative and fix them.
- Do not ignore a definite issue.
- Ignore possible_issues unless fixing a definite issue requires a related change.
- Preserve valid vertices, valid edges, and valid quantities unless they must change.
- Prefer local repairs over broad rewrites.
- Do not regenerate the graph from scratch unless the current graph is fundamentally unsalvageable.
- Return raw JSON only.
- Do not output explanations, markdown, comments, or chain-of-thought.

Repair policy:
1. Apply the smallest set of structural edits needed to fix all definite issues.
2. If a definite issue requires removing or changing a vertex or edge, update any affected quantities accordingly.
3. If a definite issue affects consumed demand, recompute all impacted recipe-produced quantities and any upstream batch-produced prerequisites.
4. If multiple definite issues describe the same underlying problem, resolve them together with one coherent repair.
5. Remove invalid or duplicate edges rather than preserving them.
6. Do not introduce new vertices or edges unless required to repair a definite issue or restore completeness after a repair.
7. Preserve the original objective string exactly in G.objective. 
8. Missing Workstations: If a workstation_dependency is missing or invalid, you MUST add the correct Minecraft workstation vertex (e.g., 'furnace' for smelting, 'crafting_table' for tools) if it does not already exist.
9. Preserve sink identity unless a definite issue shows the sinks are wrong.
10. After all repairs, ensure the final graph satisfies all structure, edge, vertex, quantity, sink, and consistency rules.

Required internal checks before returning:
- No duplicate edges for the same (from, to, type)
- Graph is acyclic
- Every sink exists and has no outgoing edges
- Every edge endpoint references an existing vertex id
- Every vertex id is unique
- Every vertex satisfies qty >= sum(outgoing consumed edge qty)
- Batch-produced quantities are batch-valid
- Smelting outputs have valid smelting_input, fuel_input, and workstation_dependency

## Validation Spec
Validate candidate JSON graph G for objective O under Minecraft Java Edition 1.21.6 survival-start rules.

### Output Contract
G must be exactly one JSON object with top-level keys: objective, sinks, vertices, edges.

### Vertices
Vertices must be inventory items only.
Required fields: id, qty, item_type, acquisition_dependency.

### Edges
Required fields: from, to, type, qty, consumed.
Allowed types: crafting_input, smelting_input, fuel_input, item_dependency, tool_dependency, workstation_dependency.

### Smelting Rules
Every smelted output requires: smelting_input, fuel_input, and workstation_dependency.

### Quantity Rules
No fractional crafts. Respect batch sizes. Overproduction allowed only when forced by batch size. For every vertex: qty >= sum(outgoing consumed edge qty).

IMPORTANT: DO NOT use markdown code blocks. DO NOT include "json" or backticks. Return ONLY the raw JSON string starting with { and ending with }.`;





















async function testPTDGeneration() {
    const objective = "Collect 1 obsidian make 1 of each type of gold tool and catch and cook a fish.";
    console.log(`Testing Self-Refine Loop for Objective: "${objective}"\n`);

    const turns = [{ role: 'user', content: `Objective: ${objective}\n\n${TASK_PROMPT}` }];
    const systemMessage = `You are an expert Minecraft AI architect. Output only valid JSON. 
    CRITICAL LOGIC RULES:
    1. SMELTING: Every smelted item (e.g., gold_ingot) MUST have 3 incoming edges: 
    - 'smelting_input' (the ore)
    - 'fuel_input' (e.g., coal, charcoal, or any_log)
    - 'workstation_dependency' (furnace).
    2. QUANTITY BALANCE: If a recipe produces 1 ingot from 1 ore, the 'qty' of the ore vertex MUST be >= the total 'qty' of ingots needed.
    3. RECIPES: golden_pickaxe=3 ingots, golden_axe=3 ingots, golden_shovel=1 ingot, golden_sword=2 ingots.
    4. WORKSTATIONS: Tools require a 'workstation_dependency' edge from a 'crafting_table'.
    5. TOOL REQUIREMENTS: If an item requires a specific tool to drop (e.g., obsidian requires a diamond_pickaxe, stone requires a pickaxe), that tool MUST be a vertex with a tool_dependency edge.
    6. ACTION MAPPING: "Catch a fish" requires a fishing_rod. "Cook" requires a furnace and fuel.
    7. FUEL SCALING: Each smelting_input unit requires 1 fuel_input unit unless using high-efficiency fuel (e.g., 1 coal = 8 items). Always round up to the nearest whole fuel item.
    8. DEPENDENCIES: Review conclusory numerical values for dependencies to guarantee that they are correct.`;

    const refinementPrompts = {
        critique: (currentGraph) => `${VALIDATOR_PROMPT}\n\nOBJECTIVE:\n"${objective}"\n\nCANDIDATE GRAPH:\n${currentGraph}`,
        refine: (feedback, currentGraph) => `${REFINER_PROMPT}\n\nOBJECTIVE:\n"${objective}"\n\nCURRENT CANDIDATE GRAPH:\n${currentGraph}\n\nVALIDATOR OUTPUT:\n${feedback}`
    };

    try {
        const output = await llm.sendRefinedRequest(turns, systemMessage, refinementPrompts, 3);
        
        // --- SANITIZATION STEP ---
        // This removes ```json and ``` from the start and end of the string for clean logging
        let cleanResult = output.finalResult;
        const jsonMatch = cleanResult.match(/\{[\s\S]*\}/); // Finds the first { and last }
        if (jsonMatch) {
            cleanResult = jsonMatch[0];
        }

        const logData = {
            timestamp: new Date().toISOString(),
            objective: objective,
            totalRounds: output.totalRounds,
            transcript: output.transcript,
            finalGraph: JSON.parse(cleanResult) 
        };

        const filename = `ptd_test_log_${Date.now()}.json`;
        fs.writeFileSync(filename, JSON.stringify(logData, null, 2));
        
        console.log(`\n✅ Test Complete! Log saved to: ${filename}`);

    } catch (error) {
        console.error("Parsing failed. Here is the raw output for debugging:\n", error);
    }
}

testPTDGeneration();