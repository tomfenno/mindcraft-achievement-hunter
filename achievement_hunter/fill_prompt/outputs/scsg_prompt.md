Task: Compute STATE_CONDITIONED_SUBGRAPH(G,S) on DAG G for achieving the objective from a fresh survival start in modern Minecraft Java Edition. Keep G immutable; operate on mutable copy G′. Vertex identity = v.id.

Input shapes
- G={objective,sinks,vertices,edges}
- v must include at least {id,qty}
- e must include at least {from,to,qty,consumed}
- S={inventory}
- inventory = "Nothing" | map[item->int>=1]

G:
```json
{
  "objective": "{{Smelt an iron ingot}}",
  "sinks": [
    "iron_ingot"
  ],
  "vertices": [
    {
      "id": "iron_ingot",
      "qty": 1,
      "item_type": "item",
      "acquisition_dependency": "none"
    },
    {
      "id": "raw_iron",
      "qty": 1,
      "item_type": "resource",
      "acquisition_dependency": "none"
    },
    {
      "id": "furnace",
      "qty": 1,
      "item_type": "workstation",
      "acquisition_dependency": "none"
    },
    {
      "id": "stone_pickaxe",
      "qty": 1,
      "item_type": "tool",
      "acquisition_dependency": "none"
    },
    {
      "id": "cobblestone",
      "qty": 11,
      "item_type": "resource",
      "acquisition_dependency": "none"
    },
    {
      "id": "wooden_pickaxe",
      "qty": 1,
      "item_type": "tool",
      "acquisition_dependency": "none"
    },
    {
      "id": "crafting_table",
      "qty": 1,
      "item_type": "workstation",
      "acquisition_dependency": "none"
    },
    {
      "id": "stick",
      "qty": 4,
      "item_type": "item",
      "acquisition_dependency": "none"
    },
    {
      "id": "any_plank",
      "qty": 12,
      "item_type": "item",
      "acquisition_dependency": "none"
    },
    {
      "id": "any_log",
      "qty": 3,
      "item_type": "resource",
      "acquisition_dependency": "none"
    }
  ],
  "edges": [
    {
      "from": "raw_iron",
      "to": "iron_ingot",
      "type": "smelting_input",
      "qty": 1,
      "consumed": true
    },
    {
      "from": "any_plank",
      "to": "iron_ingot",
      "type": "fuel_input",
      "qty": 1,
      "consumed": true
    },
    {
      "from": "furnace",
      "to": "iron_ingot",
      "type": "workstation_dependency",
      "qty": 1,
      "consumed": false
    },
    {
      "from": "stone_pickaxe",
      "to": "raw_iron",
      "type": "tool_dependency",
      "qty": 1,
      "consumed": false
    },
    {
      "from": "cobblestone",
      "to": "furnace",
      "type": "crafting_input",
      "qty": 8,
      "consumed": true
    },
    {
      "from": "crafting_table",
      "to": "furnace",
      "type": "workstation_dependency",
      "qty": 1,
      "consumed": false
    },
    {
      "from": "cobblestone",
      "to": "stone_pickaxe",
      "type": "crafting_input",
      "qty": 3,
      "consumed": true
    },
    {
      "from": "stick",
      "to": "stone_pickaxe",
      "type": "crafting_input",
      "qty": 2,
      "consumed": true
    },
    {
      "from": "crafting_table",
      "to": "stone_pickaxe",
      "type": "workstation_dependency",
      "qty": 1,
      "consumed": false
    },
    {
      "from": "wooden_pickaxe",
      "to": "cobblestone",
      "type": "tool_dependency",
      "qty": 1,
      "consumed": false
    },
    {
      "from": "any_plank",
      "to": "wooden_pickaxe",
      "type": "crafting_input",
      "qty": 3,
      "consumed": true
    },
    {
      "from": "stick",
      "to": "wooden_pickaxe",
      "type": "crafting_input",
      "qty": 2,
      "consumed": true
    },
    {
      "from": "crafting_table",
      "to": "wooden_pickaxe",
      "type": "workstation_dependency",
      "qty": 1,
      "consumed": false
    },
    {
      "from": "any_plank",
      "to": "crafting_table",
      "type": "crafting_input",
      "qty": 4,
      "consumed": true
    },
    {
      "from": "any_plank",
      "to": "stick",
      "type": "crafting_input",
      "qty": 2,
      "consumed": true
    },
    {
      "from": "any_log",
      "to": "any_plank",
      "type": "crafting_input",
      "qty": 3,
      "consumed": true
    }
  ]
}
```
S:
```json
{
  "position": {
    "x": -101.51,
    "y": 64,
    "z": -52.5
  },
  "status": {
    "health": "20/20",
    "hunger": "20/20",
    "biome": "old_growth_pine_taiga",
    "weather": "clear",
    "time_of_day": "afternoon",
    "current_action": "idle"
  },
  "inventory": {
    "spruce_log": 1,
    "spruce_planks": 12
  },
  "wearing": [],
  "craftable_items": [
    "spruce_planks",
    "crafting_table",
    "spruce_button",
    "spruce_pressure_plate",
    "stick"
  ],
  "nearby_blocks": [
    "podzol",
    "fern",
    "spruce_log",
    "dirt",
    "sand",
    "grass_block",
    "dead_bush",
    "stone",
    "short_grass",
    "mossy_cobblestone",
    "sandstone",
    "granite",
    "brown_mushroom",
    "large_fern",
    "spruce_leaves"
  ],
  "relative_blocks": {
    "below": "podzol",
    "legs": "air",
    "head": "air",
    "above_head_solid": "spruce_leaves (18 blocks up)"
  },
  "nearby_entities": {
    "human_players": [
      "ChiefChewy"
    ],
    "mobs": {},
    "bot_players": []
  }
}
```

Semantics
- startswith(v.id,"any_") => abstract class; satisfied by summed qty of valid Minecraft concrete instances of that class (e.g. spruce_log→any_log, spruce_planks→any_plank).
- Remove vertices only when explicitly included in V_rm passed to UPDATE_QUANTITIES_AND_PRUNE.
- If upstream qty becomes <=0 after decrement, do not auto-remove.
- qty<=0 has no direct pruning effect; such vertices remain until removed later by explicit pruning or the new-sink rule.
- Pruning can cascade: removing a vertex may decrement upstream consumed inputs, making more vertices satisfiable later.
- Each iteration is one full pass of steps 5a→5d: compute sat, apply it, compute disc on the updated graph, apply it.
- New sinks are structural only: vertices in GET_SINKS(G′)\GET_SINKS(G), regardless of qty or satisfiability.
- Edge direction is prerequisite→dependent (e.from→e.to), so sinks are goal-side vertices with no outgoing edges.
- G.sinks must equal GET_SINKS(G); if not, treat GET_SINKS(G) as authoritative.

Procedure
STATE_CONDITIONED_SUBGRAPH(G,S):
1. if S.inventory=="Nothing": return G
2. if GET_SINKS(G) ⊆ STATE_SATISFIED_VERTICES(G,S): return {objective:G.objective,sinks:G.sinks,vertices:[],edges:[]}
3. G′:=copy(G)
4. original_sinks:=GET_SINKS(G)
5. repeat:
   a. V_sat:=STATE_SATISFIED_VERTICES(G′,S);
   b. G′:=UPDATE_QUANTITIES_AND_PRUNE(V_sat,G′);
   c. V_disc:=GET_SINKS(G′)\original_sinks;
   d. G′:=UPDATE_QUANTITIES_AND_PRUNE(V_disc,G′);
   until V_sat=∅ and V_disc=∅
6. return G′

Output:
- Output only valid JSON; no prose.
- If S.inventory=="Nothing", output:
  {"r":1,"why":"S.inventory==Nothing","final":{"vertices":G.vertices,"edges":G.edges}}
- If every original sink is already satisfied by S, output:
  {"r":2,"why":"all original sinks satisfied","final":{"vertices":[],"edges":[]}}
- Otherwise output:
  {
    "r":0,
    "s":[<original_sink_id>...],
    "it":[
      {
        "sat":[<V_sat_id>...],
        "g1":{"vertices":[...],"edges":[...]} | "same",
        "disc":[<V_disc_id>...],
        "g2":{"vertices":[...],"edges":[...]} | "same"
      }
      ...
    ],
    "final":{"vertices":[...],"edges":[...]}
  }
- "same" means unchanged from the immediately previous graph state.
- In s, sat, disc, output only vertex ids.
- It must include the terminating iteration (sat=[] and disc=[]).

GET_SINKS(G):
- {v∈G.vertices | ¬∃e∈G.edges: e.from=v.id}

UPDATE_QUANTITIES_AND_PRUNE(V_rm,G):
1. G′:=copy(G)
2. for each vertex u in G′.vertices, initialize dec[u.id]:=0
3. for each v∈V_rm:
   for each e∈G′.edges with e.to=v.id:
      if e.consumed:
         dec[e.from]:=dec[e.from]+e.qty
4. for each u in G′.vertices:
   u.qty:=u.qty-dec[u.id]
5. remove all e with e.from∈{v.id|v∈V_rm} or e.to∈{v.id|v∈V_rm}
6. remove all v∈V_rm from G′.vertices
7. return G′

STATE_SATISFIED_VERTICES(G,S):
- return all v∈G.vertices where:
  1. if startswith(v.id,"any_"):
     sum(S.inventory[i] for concrete instances i of class v.id) >= v.qty
  2. else:
     v.id∈S.inventory and S.inventory[v.id] >= v.qty