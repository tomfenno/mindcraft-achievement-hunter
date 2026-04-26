# PTD Self\-Refine — demo live objective


## Round 0 · Generate

**Latency:** 0 ms

```mermaid
graph LR
    oak_log["oak_log ×3<br/>[resource]"]
    style oak_log fill:#4CAF50,color:#fff,stroke:#388E3C
```

---

## Round 0 · Validate

**Latency:** 0 ms

**Verdict:** ❌ fail

**Definite issues:**
- Missing crafting table workstation node

**Summary:** Need an explicit workstation vertex\.


---

## Round 1 · Refine

**Latency:** 0 ms

```mermaid
graph LR
    oak_log["oak_log ×3<br/>[resource]"]
    crafting_table["crafting_table ×1<br/>[workstation]"]
    style oak_log fill:#4CAF50,color:#fff,stroke:#388E3C
```

---

## Round 1 · Validate

**Latency:** 0 ms

**Verdict:** ✅ pass

**Summary:** Looks good\.


---
