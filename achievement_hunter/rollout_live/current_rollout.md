<table width="100%" style="table-layout: fixed; border-collapse: separate; border-spacing: 0;"><tr>
<td width="72%" valign="top" style="border: 1px solid #d0d7de; border-radius: 14px; padding: 18px 16px; box-sizing: border-box;">

_PTD not yet generated._

</td>
<td width="2%"></td>
<td width="26%" valign="top" style="border: 1px solid #d0d7de; border-radius: 14px; padding: 18px 16px; box-sizing: border-box;">

<div align="center" style="height: 100%; display: flex; flex-direction: column; justify-content: center;">
<div style="font-size: 0.85em; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.8; margin-bottom: 0.6em;">Elapsed</div>
<div style="font-size: 3.4em; font-weight: 800; line-height: 1; margin: 0 0 0.3em 0; white-space: nowrap;">6s</div>
<div style="font-size: 0.95em; font-weight: 600;">Running</div>
</div>

</td>
</tr></table>

---

<table width="100%" style="table-layout: fixed; border-collapse: separate; border-spacing: 0;"><tr>
<td width="50%" valign="top" style="border: 1px solid #d0d7de; border-radius: 14px; padding: 18px 16px; box-sizing: border-box;">

# SCSG — test
_r=1_

```mermaid
graph LR
    iron_ingot["iron_ingot ×1<br/>[item]"]
    raw_iron["raw_iron ×1<br/>[resource]"]
    furnace["furnace ×1<br/>[workstation]"]
    any_plank["any_plank ×12<br/>[item]"]
    any_log["any_log ×3<br/>[resource]"]
    stone_pickaxe["stone_pickaxe ×1<br/>[tool]"]
    wooden_pickaxe["wooden_pickaxe ×1<br/>[tool]"]
    stick["stick ×4<br/>[item]"]
    crafting_table["crafting_table ×1<br/>[workstation]"]
    cobblestone["cobblestone ×11<br/>[resource]"]
    raw_iron -->iron_ingot
    any_plank -->iron_ingot
    furnace -->iron_ingot
    stone_pickaxe -->raw_iron
    stick -->|"×2"| stone_pickaxe
    cobblestone -->|"×3"| stone_pickaxe
    crafting_table -->stone_pickaxe
    wooden_pickaxe -->cobblestone
    stick -->|"×2"| wooden_pickaxe
    any_plank -->|"×3"| wooden_pickaxe
    crafting_table -->wooden_pickaxe
    cobblestone -->|"×8"| furnace
    crafting_table -->furnace
    any_plank -->|"×2"| stick
    any_plank -->|"×4"| crafting_table
    any_log -->|"×3"| any_plank
    style iron_ingot fill:#4CAF50,color:#fff,stroke:#388E3C
```

</td>
<td width="2%"></td>
<td width="50%" valign="top" style="border: 1px solid #d0d7de; border-radius: 14px; padding: 18px 16px; box-sizing: border-box;">

# Candidates — test
_1 source node\(s\)_

```mermaid
graph LR
    any_log["any_log ×3<br/>[resource]"]
```

</td>
</tr></table>

---

<table width="100%" style="table-layout: fixed; border-collapse: separate; border-spacing: 0;"><tr>
<td width="50%" valign="top" style="border: 1px solid #d0d7de; border-radius: 14px; padding: 18px 16px; box-sizing: border-box;">

**Current Task**

```json
{
  "target_item": "any_log",
  "qty": 3,
  "action_type": "collect",
  "parameters": {
    "source_block": "any_log",
    "item_dependency": null,
    "tool": null
  }
}
```

</td>
<td width="2%"></td>
<td width="50%" valign="top" style="border: 1px solid #d0d7de; border-radius: 14px; padding: 18px 16px; box-sizing: border-box;">

**Current Action** _(attempt 5 · search)_

```
!searchForBlock("oak_log", 32)
```

**Previous:**

- _(attempt 4)_ `!search("any_log")`
- _(attempt 5 · search)_ `!searchForBlock("spruce_log", 32)`
- _(attempt 4 · search)_ `!searchForBlock("oak_log", 32)`
- _(attempt 3)_ `!search("any_log")`
- _(attempt 4 · search)_ `!searchForBlock("spruce_log", 32)`
- _(attempt 3 · search)_ `!searchForBlock("oak_log", 32)`
- _(attempt 2)_ `!search("any_log")`
- _(attempt 3 · search)_ `!searchForBlock("spruce_log", 32)`
- _(attempt 2 · search)_ `!searchForBlock("oak_log", 32)`
- _(attempt 1)_ `!search("any_log")`

</td>
</tr></table>