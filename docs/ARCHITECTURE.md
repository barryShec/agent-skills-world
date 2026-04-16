# Architecture

`agent-skills-world` is built around one primary object: the persistent
celebrity directory.

It is not a society simulator and it is not a Hermes plugin-first design.
Hermes is only a runtime adapter. The real source of truth remains the
markdown world plus the TypeScript core that manages loading, memory, and
Darwin-style evolution.

## Product Overview

```mermaid
flowchart TB
    User["User"]
    Hermes["Hermes / Any Host"]
    World["agent-skills-world"]
    Nuwa["Nuwa\ncreate celebrity canon"]
    Runtime["Runtime\nprogressive loading + response context"]
    Memory["Memory\nmarkdown-first episodic + relationship + board memory"]
    Darwin["Darwin\ncandidate extraction + evaluation + promotion"]
    Board["Advisory Board\nmulti-celebrity deliberation"]

    subgraph Celebrity["Persistent Celebrity"]
      Canon["Stable Canon\nidentity / boundaries / board-role / lenses"]
      Sessions["Session Memory\ntranscripts + summaries"]
      Relationship["Relationship Memory\nuser-specific continuity"]
      BoardCarry["Board Memory\nmember-specific carryover"]
      Versions["Versioned Evolution\npatches + changelog"]
    end

    User --> Hermes
    Hermes --> World

    World --> Nuwa
    World --> Runtime
    World --> Memory
    World --> Darwin
    World --> Board

    Nuwa --> Canon
    Runtime --> Canon
    Runtime --> Sessions
    Runtime --> Relationship
    Runtime --> BoardCarry
    Board --> BoardCarry
    Memory --> Sessions
    Memory --> Relationship
    Darwin --> Versions
    Versions --> Canon

    Canon -->|"next session loads evolved self"| Runtime
```

## Core Design

```mermaid
flowchart TB
    User["User / Operator"]
    Hermes["Hermes Adapter"]
    CLI["CLI Adapter\nsrc/adapters/cli"]
    Core["AgentSkillsWorld Core\nsrc/core/world.ts"]
    SQLite["SQLite Index\nworld/world.sqlite"]

    subgraph CelebrityWorld["Celebrity World"]
      Manifest["celebrity.json\nprogressive loading rules"]
      subgraph Canon["canon/"]
        Skill["SKILL.md"]
        Identity["identity.md"]
        Boundaries["boundaries.md"]
        BoardRole["board-role.md"]
        MentalModels["mental-models.md"]
        Heuristics["heuristics.md"]
        Expression["expression-dna.md"]
        DomainLenses["domain-lenses.md"]
        Works["notable-works.md"]
      end
      subgraph Memory["memory/"]
        UserMemory["users/<userId>/\nsessions + summaries + relationship"]
        BoardMemory["boards/<boardId>/\nsessions + recurring-topics"]
        GlobalMemory["global/\nrecurring-topics + important-relationships"]
      end
      subgraph Evolution["evolution/"]
        Candidates["candidates/"]
        Experiments["experiments/"]
        Patches["patches/"]
        Changelog["CHANGELOG.md"]
      end
      Boards["world/boards/<boardId>/\nprofile + protocol + sessions + contributions"]
    end

    User --> Hermes
    User --> CLI
    Hermes --> CLI
    CLI --> Core

    Core --> Manifest
    Core --> Canon
    Core --> Memory
    Core --> Evolution
    Core --> Boards
    Core --> SQLite

    SQLite -. fast search/index .-> Canon
    SQLite -. fast search/index .-> Memory
    SQLite -. candidate/evaluation state .-> Evolution
```

## Runtime Layers

```mermaid
flowchart LR
    Nuwa["Nuwa"]
    Loader["Progressive Loader"]
    MemoryWriter["Memory Writer"]
    Darwin["Darwin"]
    Hermes["Hermes"]

    Nuwa -->|"bootstrap / celebrity generate"| Loader
    Loader -->|"load minimal slices"| MemoryWriter
    MemoryWriter -->|"archive transcript + summary + relationship"| Darwin
    Darwin -->|"candidate -> evaluate -> promote"| Loader
    Hermes -->|"host adapter only"| Loader
    Hermes -->|"host adapter only"| MemoryWriter
```

## Single Celebrity Turn

```mermaid
sequenceDiagram
    participant U as User
    participant H as Hermes / CLI
    participant C as AgentSkillsWorld Core
    participant M as Markdown World
    participant S as SQLite

    U->>H: ask a question
    H->>C: context load(slug, query, userId)
    C->>M: load identity, boundaries, board-role
    C->>M: load topical canon slices
    C->>M: load relationship + recent summaries
    C->>S: optional search/index lookups
    C-->>H: promptBlock
    H-->>U: celebrity response

    H->>C: chat log-turn(...)
    C->>M: append session transcript
    C->>S: store session_turns + index docs

    H->>C: chat finalize(...)
    C->>M: write summary + relationship memory
    C->>M: extract Darwin candidates
    C->>S: persist candidate state
```

## Board Flow

```mermaid
sequenceDiagram
    participant U as User
    participant H as Hermes / CLI
    participant C as AgentSkillsWorld Core
    participant B as Board Directory
    participant P1 as Celebrity A
    participant P2 as Celebrity B
    participant D as Darwin

    U->>H: ask board question
    H->>C: board convene(boardId, query, userId)
    C->>B: write agenda/session shell
    C->>P1: progressiveLoad(member A)
    C->>P2: progressiveLoad(member B)
    C-->>H: combined boardPromptBlock
    H-->>U: multi-celebrity deliberation

    H->>C: board finalize(sessionId, synthesis, memberNotes)
    C->>B: write board session summary
    C->>B: write member contributions
    C->>P1: sync board memory into member A
    C->>P2: sync board memory into member B
    C->>D: future board-role / heuristic candidate pressure
```

## Design Invariants

- `Markdown first`: canon, memory, board memory, and Darwin artifacts remain
  inspectable files.
- `SQLite second`: SQLite is an index and query accelerator, not the canonical
  store.
- `Progressive loading`: never load every celebrity file by default.
- `Darwin gate`: chats create evidence and candidate patches, but do not
  directly rewrite canon.
- `Board memory split`: board-level session memory and per-member board memory
  are stored separately to avoid cross-contamination.
- `Hermes is an adapter`: the world engine stays independent of the runtime
  host.

## What This Means Product-Wise

- `Any celebrity can persist`: each celebrity is a durable directory, not a
  temporary prompt.
- `Any celebrity can evolve`: post-chat evidence creates Darwin candidates
  instead of rewriting canon inline.
- `Any celebrity can join a board`: board memory is shared at the board level
  and also carried back into each member's own memory.
- `Any runtime can host it`: Hermes is one adapter today, but the core world
  engine stays reusable for CLI, HTTP, or future hosts.
