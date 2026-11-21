# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root, or
- **`GLOSSARY-MAP.md`** at the repo root if it exists: it points at one `GLOSSARY.md` per context. Read each one relevant to the topic.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## In this repo (single-context)

**`GLOSSARY.md` and `CONTEXT.md` are the same file under two names.** The skill copies in `.claude/skills/`
(used in cloud sessions) call it `GLOSSARY.md`; the older copies in the user's `~/.claude/skills/` (which win
on the user's Mac) call it `CONTEXT.md`. Read whichever exists. When creating it, use `GLOSSARY.md`; if a
`CONTEXT.md` already exists, keep writing to it rather than creating a second file. The same applies to
`GLOSSARY-MAP.md` / `CONTEXT-MAP.md`.

Neither the glossary nor `docs/adr/` exists yet. Until they do, the domain knowledge lives in two Swedish documents
that **must** be read before exploring:

- **`docs/koncept-och-beslut.md`**: concepts (byggnad, installation, åtgärd, rond, rutintillfälle …),
  a numbered list of decisions, the stages (etapper) and open questions. Treat the numbered decisions like ADRs:
  flag any output that contradicts one.
- **`docs/ideer-och-resonemang.md`**: ideas and reasoning that are not built yet.

When `/domain-modeling` creates `GLOSSARY.md` or ADRs, write them in Swedish and keep them consistent with
these documents (move or link content rather than duplicating it).

## File structure

Single-context repo (most repos):

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

Multi-context repo (presence of `GLOSSARY-MAP.md` at the root):

```
/
├── GLOSSARY-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── GLOSSARY.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── GLOSSARY.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
