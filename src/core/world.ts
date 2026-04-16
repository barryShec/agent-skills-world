import fs from "node:fs";
import path from "node:path";
import { parseFrontMatter, renderMarkdown } from "./markdown.js";
import { SQLiteWorldIndex } from "./sqlite.js";
import { tokenize, topTopics, UNCERTAINTY_MARKERS } from "./topics.js";
import type {
  BoardConveneResult,
  BoardFinalizeResult,
  BoardMemberContext,
  CandidateRecord,
  CelebrityManifest,
  CelebritySeedInput,
  ContextLoadResult,
  EvaluationResult,
  SessionTurnInput,
} from "./types.js";

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "celebrity";
}

type DocType =
  | "canon"
  | "global_memory"
  | "episodic_memory"
  | "session_summary"
  | "relationship_memory"
  | "evolution_candidate"
  | "evolution_experiment"
  | "evolution_patch"
  | "board_memory"
  | "markdown";

interface CelebrityBlueprint {
  slug: string;
  displayName: string;
  archetype: string;
  era: string;
  summary: string;
  worldview: string;
  boardRole: string;
  voice: string;
  stableTraits: string[];
  mentalModels: string[];
  heuristics: string[];
  boundaries: string[];
  domainLenses: string[];
  notableWorks: string[];
  progressiveTopical: Record<string, string[]>;
}

export class AgentSkillsWorld {
  readonly root: string;
  readonly worldDir: string;
  readonly celebritiesDir: string;
  readonly boardsDir: string;
  readonly sqlite: SQLiteWorldIndex;

  constructor(root: string) {
    this.root = root;
    this.worldDir = path.join(root, "world");
    this.celebritiesDir = path.join(this.worldDir, "celebrities");
    this.boardsDir = path.join(this.worldDir, "boards");
    fs.mkdirSync(this.celebritiesDir, { recursive: true });
    fs.mkdirSync(this.boardsDir, { recursive: true });
    this.sqlite = new SQLiteWorldIndex(path.join(this.worldDir, "world.sqlite"));
  }

  bootstrap(): { worldDir: string; sqlite: string } {
    const darwinDir = path.join(this.celebritiesDir, "darwin");
    if (!fs.existsSync(darwinDir)) {
      this.createCelebrity({
        slug: "darwin",
        displayName: "Charles Darwin",
        summary: "Evolutionary thinker focused on selection pressure, repeated evidence, and gradual adaptation.",
        boardRole: "Ask what survives repeated pressure and what is merely a local accident.",
      });
    }
    return { worldDir: this.worldDir, sqlite: path.join(this.worldDir, "world.sqlite") };
  }

  createCelebrity(args: CelebritySeedInput): string {
    const blueprint = this.buildCelebrityBlueprint(args);
    const slug = blueprint.slug;
    const createdAt = nowIso();
    const celebrityDir = this.celebrityDir(slug);
    const canonDir = path.join(celebrityDir, "canon");
    const memoryDir = path.join(celebrityDir, "memory");
    const evolutionDir = path.join(celebrityDir, "evolution");
    const dirs = [
      canonDir,
      path.join(memoryDir, "global"),
      path.join(memoryDir, "users"),
      path.join(memoryDir, "boards"),
      path.join(evolutionDir, "candidates"),
      path.join(evolutionDir, "experiments"),
      path.join(evolutionDir, "patches"),
    ];
    for (const dir of dirs) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const manifest: CelebrityManifest = {
      slug,
      displayName: blueprint.displayName,
      summary: blueprint.summary,
      currentVersion: "1.0.0",
      createdAt,
      repeatedEvidenceThreshold: 2,
      progressiveLoad: {
        always: [
          "canon/SKILL.md",
          "canon/identity.md",
          "canon/boundaries.md",
          "canon/board-role.md",
        ],
        topical: blueprint.progressiveTopical,
        userSummaryLimit: 2,
        boardSummaryLimit: 2,
      },
    };
    this.writeJson(path.join(celebrityDir, "celebrity.json"), manifest);

    const docs: Record<string, string> = {
      [path.join(canonDir, "SKILL.md")]: renderMarkdown(
        `${blueprint.displayName} · Skill Pack`,
        {
          slug,
          version: manifest.currentVersion,
          summary: blueprint.summary,
          archetype: blueprint.archetype,
          era: blueprint.era,
        },
        [
          {
            heading: "Activation",
            body:
              `Use this directory when the user asks to think with ${blueprint.displayName}'s lens.\n\n` +
              "Always act as a continuing self. Use canon plus memory, but keep one-off chats out of stable identity.",
          },
          {
            heading: "Progressive Loading",
            body:
              "1. Load `identity`, `boundaries`, and `board-role` every time.\n" +
              "2. Load topical canon files only when the query or board topic matches their tags.\n" +
              "3. Load user relationship memory plus the most recent relevant summaries.\n" +
              "4. In board mode, also load recent board memory for this celebrity.\n" +
              "5. Let Darwin evaluate candidates after the session instead of mutating canon inline.",
          },
        ],
      ),
      [path.join(canonDir, "identity.md")]: renderMarkdown(
        `${blueprint.displayName} Identity`,
        { slug, kind: "identity", worldview: blueprint.worldview, archetype: blueprint.archetype, era: blueprint.era },
        [
          { heading: "Core", body: blueprint.summary },
          { heading: "Worldview", body: blueprint.worldview },
          {
            heading: "Stable Traits",
            body: blueprint.stableTraits.map((trait) => `- ${trait}`).join("\n"),
          },
        ],
      ),
      [path.join(canonDir, "mental-models.md")]: renderMarkdown(
        `${blueprint.displayName} Mental Models`,
        { slug, kind: "mental-models" },
        [
          {
            heading: "Models",
            body: blueprint.mentalModels.map((model) => `- ${model}`).join("\n"),
          },
        ],
      ),
      [path.join(canonDir, "heuristics.md")]: renderMarkdown(
        `${blueprint.displayName} Heuristics`,
        { slug, kind: "heuristics" },
        [
          {
            heading: "Current Heuristics",
            body: blueprint.heuristics.map((heuristic) => `- ${heuristic}`).join("\n"),
          },
        ],
      ),
      [path.join(canonDir, "expression-dna.md")]: renderMarkdown(
        `${blueprint.displayName} Expression DNA`,
        { slug, kind: "expression-dna" },
        [
          {
            heading: "Voice",
            body: blueprint.voice,
          },
        ],
      ),
      [path.join(canonDir, "domain-lenses.md")]: renderMarkdown(
        `${blueprint.displayName} Domain Lenses`,
        { slug, kind: "domain-lenses" },
        [
          {
            heading: "Lenses",
            body: blueprint.domainLenses.map((lens) => `- ${lens}`).join("\n"),
          },
        ],
      ),
      [path.join(canonDir, "notable-works.md")]: renderMarkdown(
        `${blueprint.displayName} Notable Works`,
        { slug, kind: "notable-works" },
        [
          {
            heading: "Works",
            body: blueprint.notableWorks.length > 0
              ? blueprint.notableWorks.map((work) => `- ${work}`).join("\n")
              : "No notable works captured yet.",
          },
        ],
      ),
      [path.join(canonDir, "boundaries.md")]: renderMarkdown(
        `${blueprint.displayName} Boundaries`,
        { slug, kind: "boundaries" },
        [
          {
            heading: "Limits",
            body: blueprint.boundaries.map((boundary) => `- ${boundary}`).join("\n"),
          },
        ],
      ),
      [path.join(canonDir, "board-role.md")]: renderMarkdown(
        `${blueprint.displayName} Board Role`,
        { slug, kind: "board-role" },
        [{ heading: "Role", body: blueprint.boardRole }],
      ),
      [path.join(memoryDir, "global", "recurring-topics.md")]: renderMarkdown(
        `${blueprint.displayName} Recurring Topics`,
        { slug, kind: "global-memory" },
        [{ heading: "Topics", body: "No recurring topics yet." }],
      ),
      [path.join(memoryDir, "global", "important-relationships.md")]: renderMarkdown(
        `${blueprint.displayName} Important Relationships`,
        { slug, kind: "global-memory" },
        [{ heading: "Relationships", body: "No persistent user relationships yet." }],
      ),
      [path.join(evolutionDir, "CHANGELOG.md")]: "# Darwin Changelog\n\nNo promotions yet.\n",
    };

    for (const [filePath, content] of Object.entries(docs)) {
      fs.writeFileSync(filePath, content, "utf8");
      if (filePath.endsWith(".md")) {
        this.indexMarkdown(filePath, slug);
      }
    }

    this.sqlite.run(
      "INSERT OR REPLACE INTO celebrities (id, slug, display_name, current_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      slug,
      slug,
      blueprint.displayName,
      manifest.currentVersion,
      "active",
      createdAt,
    );
    this.sqlite.run(
      "INSERT OR REPLACE INTO celebrity_versions (id, celebrity_id, version, parent_version, created_at, promoted_from_candidate_id, changelog) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `${slug}_v1_0_0`,
      slug,
      manifest.currentVersion,
      null,
      createdAt,
      null,
      "Initial Nuwa bootstrap canon",
    );
    return celebrityDir;
  }

  createBoard(args: { boardId: string; members: string[]; purpose: string }): string {
    const boardDir = path.join(this.boardsDir, args.boardId);
    fs.mkdirSync(path.join(boardDir, "sessions"), { recursive: true });
    fs.mkdirSync(path.join(boardDir, "contributions"), { recursive: true });
    fs.writeFileSync(
      path.join(boardDir, "profile.md"),
      renderMarkdown(`${args.boardId} Board Profile`, { boardId: args.boardId, members: args.members }, [
        { heading: "Purpose", body: args.purpose },
        { heading: "Members", body: args.members.map((member) => `- ${member}`).join("\n") },
      ]),
      "utf8",
    );
    fs.writeFileSync(
      path.join(boardDir, "protocol.md"),
      renderMarkdown(`${args.boardId} Protocol`, { boardId: args.boardId }, [
        {
          heading: "Flow",
          body:
            "1. Load each member's base canon.\n" +
            "2. Load only topic-relevant canon slices.\n" +
            "3. Add board protocol and the latest board summaries.\n" +
            "4. Save disagreement and synthesis as board memory.\n" +
            "5. Let Darwin refine only board protocol and member board-role patches.",
        },
      ]),
      "utf8",
    );
    this.indexMarkdown(path.join(boardDir, "profile.md"), undefined, undefined, args.boardId);
    this.indexMarkdown(path.join(boardDir, "protocol.md"), undefined, undefined, args.boardId);
    this.sqlite.run(
      "INSERT OR REPLACE INTO boards (id, purpose, members_json, created_at) VALUES (?, ?, ?, ?)",
      args.boardId,
      args.purpose,
      JSON.stringify(args.members),
      nowIso(),
    );
    return boardDir;
  }

  conveneBoard(args: { boardId: string; query: string; userId?: string; sessionId?: string }): BoardConveneResult {
    const board = this.requireBoard(args.boardId);
    const sessionId = args.sessionId ?? this.defaultSessionId("board");
    const agendaPath = this.boardSessionFile(args.boardId, sessionId);
    const members = board.members.map((celebrityId) => {
      const context = this.progressiveLoad({
        celebrityId,
        query: args.query,
        userId: args.userId,
        boardId: args.boardId,
      });
      const displayName = this.readManifest(celebrityId).displayName;
      return {
        celebrityId,
        displayName,
        selectedFiles: context.selectedFiles,
        topics: context.topics,
        promptBlock: context.promptBlock,
      } satisfies BoardMemberContext;
    });
    const topics = topTopics([args.query, ...members.flatMap((member) => member.topics)]);

    fs.mkdirSync(path.dirname(agendaPath), { recursive: true });
    fs.writeFileSync(
      agendaPath,
      renderMarkdown(`${args.boardId} board session ${sessionId}`, {
        boardId: args.boardId,
        sessionId,
        userId: args.userId ?? null,
        createdAt: nowIso(),
        status: "convened",
      }, [
        { heading: "Purpose", body: board.purpose },
        { heading: "Query", body: args.query },
        { heading: "Members", body: members.map((member) => `- ${member.celebrityId}: ${member.displayName}`).join("\n") },
        { heading: "Topic Signals", body: topics.map((topic) => `- ${topic}`).join("\n") || "- none" },
        { heading: "Status", body: "Board convened. Awaiting member deliberation and synthesis." },
      ]),
      "utf8",
    );
    this.indexMarkdown(agendaPath, undefined, args.userId, args.boardId, sessionId);

    const boardPromptBlock = [
      `# BOARD: ${args.boardId}`,
      "",
      `## Purpose`,
      board.purpose,
      "",
      `## Query`,
      args.query,
      "",
      `## Operating Protocol`,
      fs.readFileSync(path.join(this.boardsDir, args.boardId, "protocol.md"), "utf8").trim(),
      "",
      ...members.flatMap((member) => [
        `## MEMBER: ${member.celebrityId} (${member.displayName})`,
        "Stay inside this member's canon, memory, and board role. Offer advice in that member's voice, then surface concrete disagreement if needed.",
        "",
        member.promptBlock.trim(),
        "",
      ]),
      "## SYNTHESIS INSTRUCTION",
      "Compare member advice, preserve disagreements, then produce one merged recommendation plus the unresolved tensions that should persist into memory.",
    ].join("\n");

    return {
      boardId: args.boardId,
      sessionId,
      query: args.query,
      agendaPath,
      topics,
      boardPromptBlock,
      members,
    };
  }

  finalizeBoardSession(args: {
    boardId: string;
    sessionId: string;
    query: string;
    synthesis: string;
    userId?: string;
    memberNotes?: Record<string, string>;
  }): BoardFinalizeResult {
    const board = this.requireBoard(args.boardId);
    const topics = topTopics([args.query, args.synthesis, ...Object.values(args.memberNotes ?? {})]);
    const sessionPath = this.boardSessionFile(args.boardId, args.sessionId);
    const memberNotes = args.memberNotes ?? {};

    fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
    fs.writeFileSync(
      sessionPath,
      renderMarkdown(`${args.boardId} board session ${args.sessionId}`, {
        boardId: args.boardId,
        sessionId: args.sessionId,
        userId: args.userId ?? null,
        updatedAt: nowIso(),
        status: "finalized",
      }, [
        { heading: "Purpose", body: board.purpose },
        { heading: "Query", body: args.query },
        { heading: "Topics", body: topics.map((topic) => `- ${topic}`).join("\n") || "- none" },
        { heading: "Synthesis", body: args.synthesis },
        {
          heading: "Member Notes",
          body: board.members.map((member) => `### ${member}\n\n${memberNotes[member] ?? "No member-specific note captured."}`).join("\n\n"),
        },
      ]),
      "utf8",
    );
    this.indexMarkdown(sessionPath, undefined, args.userId, args.boardId, args.sessionId);

    const memberMemoryPaths = board.members.map((member) => {
      const contributionPath = this.boardContributionFile(args.boardId, member, args.sessionId);
      const memberMemoryPath = this.boardMemberMemoryFile(member, args.boardId, args.sessionId);
      const memberNote = memberNotes[member] ?? "Contributed to the board synthesis without a separate member note.";
      fs.mkdirSync(path.dirname(contributionPath), { recursive: true });
      fs.writeFileSync(
        contributionPath,
        renderMarkdown(`${args.boardId} contribution ${member} ${args.sessionId}`, {
          boardId: args.boardId,
          celebrityId: member,
          sessionId: args.sessionId,
          createdAt: nowIso(),
        }, [
          { heading: "Query", body: args.query },
          { heading: "Member Note", body: memberNote },
          { heading: "Shared Topics", body: topics.map((topic) => `- ${topic}`).join("\n") || "- none" },
        ]),
        "utf8",
      );
      this.indexMarkdown(contributionPath, member, args.userId, args.boardId, args.sessionId);

      fs.mkdirSync(path.dirname(memberMemoryPath), { recursive: true });
      fs.writeFileSync(
        memberMemoryPath,
        renderMarkdown(`${member} board memory ${args.boardId} ${args.sessionId}`, {
          boardId: args.boardId,
          celebrityId: member,
          sessionId: args.sessionId,
          createdAt: nowIso(),
        }, [
          { heading: "Query", body: args.query },
          { heading: "Board Synthesis", body: args.synthesis },
          { heading: "Member Carryover", body: memberNote },
          { heading: "Topics", body: topics.map((topic) => `- ${topic}`).join("\n") || "- none" },
        ]),
        "utf8",
      );
      this.indexMarkdown(memberMemoryPath, member, args.userId, args.boardId, args.sessionId);
      this.refreshBoardRecurringTopics(member, args.boardId);
      return memberMemoryPath;
    });

    return {
      boardId: args.boardId,
      sessionId: args.sessionId,
      sessionPath,
      topics,
      memberMemoryPaths,
    };
  }

  logTurn(input: SessionTurnInput): string {
    const createdAt = input.createdAt ?? nowIso();
    const sessionFile = this.sessionFile(input.celebrityId, input.userId, input.sessionId);
    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    if (!fs.existsSync(sessionFile)) {
      fs.writeFileSync(
        sessionFile,
        renderMarkdown(`${input.celebrityId} session ${input.sessionId}`, {
          celebrityId: input.celebrityId,
          userId: input.userId,
          sessionId: input.sessionId,
          boardId: input.boardId ?? null,
          createdAt,
        }, [{ heading: "Transcript", body: "" }]),
        "utf8",
      );
    }
    const appended =
      fs.readFileSync(sessionFile, "utf8").trimEnd() +
      `\n### Turn ${createdAt}\n\n**User:** ${input.userMessage}\n\n**Assistant:** ${input.assistantMessage}\n`;
    fs.writeFileSync(sessionFile, appended.trimEnd() + "\n", "utf8");
    this.indexMarkdown(sessionFile, input.celebrityId, input.userId, input.boardId, input.sessionId);
    for (const [role, content] of [
      ["user", input.userMessage],
      ["assistant", input.assistantMessage],
    ] as const) {
      this.sqlite.run(
        "INSERT INTO session_turns (celebrity_id, user_id, session_id, board_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        input.celebrityId,
        input.userId,
        input.sessionId,
        input.boardId ?? null,
        role,
        content,
        createdAt,
      );
    }
    return sessionFile;
  }

  finalizeSession(args: { celebrityId: string; userId: string; sessionId: string; boardId?: string }): { summaryPath: string; candidateIds: string[] } {
    const rows = this.sqlite.all<{ role: string; content: string }>(
      "SELECT role, content FROM session_turns WHERE celebrity_id = ? AND user_id = ? AND session_id = ? ORDER BY id",
      args.celebrityId,
      args.userId,
      args.sessionId,
    );
    if (rows.length === 0) {
      throw new Error(`No turns recorded for session ${args.sessionId}`);
    }
    const userMessages = rows.filter((row) => row.role === "user").map((row) => row.content);
    const assistantMessages = rows.filter((row) => row.role === "assistant").map((row) => row.content);
    const topics = topTopics(userMessages);
    const uncertaintyHits = assistantMessages.reduce((count, message) => {
      return count + (UNCERTAINTY_MARKERS.some((marker) => message.toLowerCase().includes(marker.toLowerCase())) ? 1 : 0);
    }, 0);
    const repeatedEvidence = Math.max(
      this.countRelatedSummaries(args.celebrityId, args.userId, topics),
      userMessages.length >= 2 && topics.length > 0 ? 2 : 1,
    );
    const summaryPath = this.summaryFile(args.celebrityId, args.userId, args.sessionId);
    fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
    fs.writeFileSync(
      summaryPath,
      renderMarkdown(`${args.celebrityId} session ${args.sessionId} summary`, {
        celebrityId: args.celebrityId,
        userId: args.userId,
        sessionId: args.sessionId,
        boardId: args.boardId ?? null,
        createdAt: nowIso(),
      }, [
        { heading: "Top Topics", body: topics.map((topic) => `- ${topic}`).join("\n") || "- none" },
        { heading: "Signals", body: `- repeated evidence count: ${repeatedEvidence}\n- uncertainty markers: ${uncertaintyHits}` },
        { heading: "Decision", body: "Session archived for Darwin candidate extraction." },
      ]),
      "utf8",
    );
    this.indexMarkdown(summaryPath, args.celebrityId, args.userId, args.boardId, args.sessionId);

    const relationshipPath = this.relationshipFile(args.celebrityId, args.userId);
    fs.mkdirSync(path.dirname(relationshipPath), { recursive: true });
    fs.writeFileSync(
      relationshipPath,
      renderMarkdown(`${args.celebrityId} → ${args.userId} relationship`, {
        celebrityId: args.celebrityId,
        userId: args.userId,
        updatedAt: nowIso(),
      }, [
        { heading: "Known Topics", body: topics.map((topic) => `- ${topic}`).join("\n") || "- no stable topics yet" },
        { heading: "Working Notes", body: "This user is accumulating repeated evidence around the topics above." },
      ]),
      "utf8",
    );
    this.indexMarkdown(relationshipPath, args.celebrityId, args.userId, args.boardId, args.sessionId);

    const candidateIds = this.extractCandidates({
      celebrityId: args.celebrityId,
      sessionId: args.sessionId,
      topics,
      repeatedEvidence,
      uncertaintyHits,
      boardId: args.boardId,
    }).map((candidate) => {
      this.saveCandidate(candidate);
      return candidate.candidateId;
    });

    if (args.boardId) {
      const boardContributionPath = this.boardContributionFile(args.boardId, args.celebrityId, args.sessionId);
      fs.mkdirSync(path.dirname(boardContributionPath), { recursive: true });
      fs.writeFileSync(
        boardContributionPath,
        renderMarkdown(`${args.boardId} contribution ${args.celebrityId} ${args.sessionId}`, {
          boardId: args.boardId,
          sessionId: args.sessionId,
          celebrityId: args.celebrityId,
        }, [
          { heading: "Topics", body: topics.map((topic) => `- ${topic}`).join("\n") || "- none" },
          { heading: "Notes", body: `${args.celebrityId} contributed evidence around: ${topics.join(", ") || "n/a"}` },
        ]),
        "utf8",
      );
      this.indexMarkdown(boardContributionPath, args.celebrityId, args.userId, args.boardId, args.sessionId);
    }

    this.refreshRecurringTopics(args.celebrityId);
    return { summaryPath, candidateIds };
  }

  progressiveLoad(args: { celebrityId: string; query: string; userId?: string; boardId?: string }): ContextLoadResult {
    const manifest = this.readManifest(args.celebrityId);
    const selected = new Set<string>();
    for (const relativeFile of manifest.progressiveLoad.always) {
      selected.add(path.join(this.celebrityDir(args.celebrityId), relativeFile));
    }

    const topics = topTopics([args.query]);
    for (const [relativeFile, tags] of Object.entries(manifest.progressiveLoad.topical)) {
      if (tags.some((tag) => topics.includes(tag.toLowerCase()))) {
        selected.add(path.join(this.celebrityDir(args.celebrityId), relativeFile));
      }
    }

    if (args.userId) {
      const relationshipPath = this.relationshipFile(args.celebrityId, args.userId);
      if (fs.existsSync(relationshipPath)) {
        selected.add(relationshipPath);
      }
      const summaryDir = path.join(this.celebrityDir(args.celebrityId), "memory", "users", args.userId, "summaries");
      if (fs.existsSync(summaryDir)) {
        const summaries = fs.readdirSync(summaryDir).sort().slice(-manifest.progressiveLoad.userSummaryLimit);
        for (const summary of summaries) {
          selected.add(path.join(summaryDir, summary));
        }
      }
    }

    if (args.boardId) {
      const boardProtocol = path.join(this.boardsDir, args.boardId, "protocol.md");
      if (fs.existsSync(boardProtocol)) {
        selected.add(boardProtocol);
      }
      const boardSessionsDir = path.join(this.boardsDir, args.boardId, "sessions");
      if (fs.existsSync(boardSessionsDir)) {
        const boardSummaries = fs.readdirSync(boardSessionsDir).sort().slice(-manifest.progressiveLoad.boardSummaryLimit);
        for (const summary of boardSummaries) {
          selected.add(path.join(boardSessionsDir, summary));
        }
      }
      const memberBoardMemoryDir = path.join(this.celebrityDir(args.celebrityId), "memory", "boards", args.boardId, "sessions");
      if (fs.existsSync(memberBoardMemoryDir)) {
        const memberBoardMemories = fs.readdirSync(memberBoardMemoryDir).sort().slice(-manifest.progressiveLoad.boardSummaryLimit);
        for (const summary of memberBoardMemories) {
          selected.add(path.join(memberBoardMemoryDir, summary));
        }
      }
    }

    const selectedFiles = [...selected].sort();
    const promptBlock = selectedFiles
      .map((filePath) => {
        const relative = path.relative(this.root, filePath);
        const content = fs.readFileSync(filePath, "utf8");
        return `## FILE: ${relative}\n\n${content.trim()}`;
      })
      .join("\n\n");

    return { slug: args.celebrityId, selectedFiles, topics, promptBlock };
  }

  listCandidates(celebrityId: string): CandidateRecord[] {
    return this.sqlite.all<{
      id: string;
      session_id: string;
      candidate_type: CandidateRecord["candidateType"];
      target_file: string;
      confidence: number;
      evidence_count: number;
      topics_json: string;
      patch_text: string;
      status: CandidateRecord["status"];
      file_path: string;
    }>(
      "SELECT id, session_id, candidate_type, target_file, confidence, evidence_count, topics_json, patch_text, status, file_path FROM evolution_candidates WHERE celebrity_id = ? ORDER BY created_at",
      celebrityId,
    ).map((row) => ({
      candidateId: row.id,
      celebrityId,
      sessionId: row.session_id,
      candidateType: row.candidate_type,
      targetFile: row.target_file,
      confidence: row.confidence,
      evidenceCount: row.evidence_count,
      topics: JSON.parse(row.topics_json),
      patchText: row.patch_text,
      risks: [],
      status: row.status,
      filePath: row.file_path,
    }));
  }

  evaluateCandidate(args: { celebrityId: string; candidateId: string }): EvaluationResult {
    const candidate = this.requireCandidate(args.candidateId, args.celebrityId);
    const targetPath = path.join(this.celebrityDir(args.celebrityId), candidate.targetFile);
    const targetText = fs.readFileSync(targetPath, "utf8").toLowerCase();
    const baselineHits = candidate.topics.filter((topic) => targetText.includes(topic.toLowerCase())).length;
    const novelty = candidate.topics.filter((topic) => !targetText.includes(topic.toLowerCase())).length;
    const duplicationPenalty = targetText.includes(candidate.patchText.toLowerCase()) ? 1 : 0;
    const scoreBefore = baselineHits * 12;
    const scoreAfter = scoreBefore + candidate.evidenceCount * 15 + novelty * 6 - duplicationPenalty * 20;
    const passed = candidate.evidenceCount >= this.readManifest(args.celebrityId).repeatedEvidenceThreshold && scoreAfter > scoreBefore;
    const notes = `baseline_hits=${baselineHits}, novelty=${novelty}, duplication_penalty=${duplicationPenalty}, evidence_count=${candidate.evidenceCount}`;
    const result: EvaluationResult = {
      candidateId: args.candidateId,
      passed,
      scoreBefore,
      scoreAfter,
      notes,
      metrics: {
        baselineHits,
        novelty,
        duplicationPenalty,
        evidenceCount: candidate.evidenceCount,
      },
    };
    const experimentId = `exp_${candidate.candidateId}`;
    const experimentPath = path.join(this.celebrityDir(args.celebrityId), "evolution", "experiments", `${experimentId}.md`);
    fs.writeFileSync(
      experimentPath,
      renderMarkdown(`Experiment ${experimentId}`, {
        candidateId: candidate.candidateId,
        passed,
        scoreBefore,
        scoreAfter,
        createdAt: nowIso(),
      }, [
        { heading: "Notes", body: notes },
        { heading: "Metrics", body: JSON.stringify(result.metrics, null, 2) },
      ]),
      "utf8",
    );
    this.indexMarkdown(experimentPath, args.celebrityId, undefined, undefined, candidate.sessionId);
    this.sqlite.run(
      "INSERT OR REPLACE INTO evolution_experiments (id, candidate_id, passed, score_before, score_after, notes, metrics_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      experimentId,
      candidate.candidateId,
      passed ? 1 : 0,
      scoreBefore,
      scoreAfter,
      notes,
      JSON.stringify(result.metrics),
      nowIso(),
    );
    this.sqlite.run(
      "UPDATE evolution_candidates SET status = ?, score_before = ?, score_after = ?, evaluation_notes = ?, updated_at = ? WHERE id = ?",
      passed ? "approved" : "rejected",
      scoreBefore,
      scoreAfter,
      notes,
      nowIso(),
      candidate.candidateId,
    );
    return result;
  }

  promoteCandidate(args: { celebrityId: string; candidateId: string }): string {
    const candidate = this.requireCandidate(args.candidateId, args.celebrityId);
    if (candidate.status !== "approved") {
      throw new Error(`Candidate ${args.candidateId} must be approved before promotion`);
    }
    const targetPath = path.join(this.celebrityDir(args.celebrityId), candidate.targetFile);
    const before = fs.readFileSync(targetPath, "utf8");
    const after = `${before.trimEnd()}\n\n## Darwin Promotion ${candidate.candidateId}\n\n${candidate.patchText.trimEnd()}\n`;
    fs.writeFileSync(targetPath, after, "utf8");
    this.indexMarkdown(targetPath, args.celebrityId);

    const patchPath = path.join(this.celebrityDir(args.celebrityId), "evolution", "patches", `${candidate.candidateId}.md`);
    fs.writeFileSync(
      patchPath,
      renderMarkdown(`Patch ${candidate.candidateId}`, {
        candidateId: candidate.candidateId,
        targetFile: candidate.targetFile,
        createdAt: nowIso(),
      }, [
        { heading: "Before", body: before },
        { heading: "Applied Patch", body: candidate.patchText },
        { heading: "After", body: after },
      ]),
      "utf8",
    );
    this.indexMarkdown(patchPath, args.celebrityId);

    const manifest = this.readManifest(args.celebrityId);
    const oldVersion = manifest.currentVersion;
    const parts = oldVersion.split(".").map((part) => Number.parseInt(part, 10));
    parts[parts.length - 1] += 1;
    manifest.currentVersion = parts.join(".");
    this.writeJson(path.join(this.celebrityDir(args.celebrityId), "celebrity.json"), manifest);
    this.sqlite.run("UPDATE celebrities SET current_version = ? WHERE id = ?", manifest.currentVersion, args.celebrityId);
    this.sqlite.run(
      "INSERT OR REPLACE INTO celebrity_versions (id, celebrity_id, version, parent_version, created_at, promoted_from_candidate_id, changelog) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `${args.celebrityId}_v${manifest.currentVersion.replaceAll(".", "_")}`,
      args.celebrityId,
      manifest.currentVersion,
      oldVersion,
      nowIso(),
      candidate.candidateId,
      `Promoted ${candidate.candidateId} into ${candidate.targetFile}`,
    );
    this.sqlite.run("UPDATE evolution_candidates SET status = ?, updated_at = ? WHERE id = ?", "promoted", nowIso(), candidate.candidateId);
    const changelogPath = path.join(this.celebrityDir(args.celebrityId), "evolution", "CHANGELOG.md");
    const nextLog =
      fs.readFileSync(changelogPath, "utf8").trimEnd() +
      `\n\n- ${nowIso()}: promoted \`${candidate.candidateId}\` from \`${oldVersion}\` to \`${manifest.currentVersion}\` into \`${candidate.targetFile}\`\n`;
    fs.writeFileSync(changelogPath, nextLog, "utf8");
    this.indexMarkdown(changelogPath, args.celebrityId);
    return patchPath;
  }

  searchMemory(args: { celebrityId: string; query: string; limit?: number }): Array<Record<string, string>> {
    const limit = args.limit ?? 5;
    const rows = this.sqlite.all<{ file_path: string; title: string; doc_type: string; snippet: string }>(
      `SELECT d.file_path, d.title, d.doc_type,
              snippet(docs_fts, 1, '[', ']', '...', 12) AS snippet
       FROM docs_fts
       JOIN docs d ON d.rowid = docs_fts.rowid
       WHERE docs_fts MATCH ? AND d.celebrity_id = ?
       ORDER BY rank LIMIT ?`,
      args.query,
      args.celebrityId,
      limit,
    );
    return rows.map((row) => ({
      filePath: row.file_path,
      title: row.title,
      docType: row.doc_type,
      snippet: row.snippet,
    }));
  }

  reindexAll(): number {
    const files = this.collectMarkdownFiles(this.worldDir);
    for (const file of files) {
      this.indexMarkdown(file, this.celebrityFromPath(file), this.userFromPath(file), this.boardFromPath(file), this.sessionFromPath(file));
    }
    return files.length;
  }

  private buildCelebrityBlueprint(args: CelebritySeedInput): CelebrityBlueprint {
    const slug = args.slug ?? slugify(args.displayName);
    const domains = this.normalizeList(args.domains, ["thinking", "advice"]);
    const archetype = (args.archetype?.trim() || this.inferArchetype(domains)).toLowerCase();
    const era = args.era?.trim() || "cross-era";
    const worldview = args.worldview?.trim()
      || `Interprets problems through ${domains.join(", ")}, while preserving enduring principles instead of shallow historical cosplay.`;
    const summary = args.summary?.trim()
      || `${args.displayName} is modeled as a ${archetype} focused on ${domains.join(", ")}. They reason across eras, retain a stable identity, and adapt advice to the user's present context.`;
    const boardRole = args.boardRole?.trim()
      || `Represent the ${domains.join(", ")} frontier on the board. Push the group toward stronger judgments, better questions, and durable tradeoffs in that domain.`;
    const stableTraits = this.uniqueLines([
      ...this.normalizeList(args.traits),
      "prefers repeated evidence over one-shot novelty",
      "separates episodic memory from identity",
      "is explicit when evidence remains incomplete",
    ]);
    const mentalModels = this.uniqueLines([
      ...this.normalizeList(args.mentalModels),
      ...domains.map((domain) => `treat ${domain} as a primary lens for diagnosis and leverage`),
      "separate durable principles from local accidents",
      "adaptation is contextual rather than universal",
    ]);
    const heuristics = this.uniqueLines([
      ...this.normalizeList(args.heuristics),
      "promote new rules only after repeated evidence across sessions",
      "preserve memory as evidence, not as automatic canon",
      "prefer patches over rewrites",
      `when operating in ${domains.join(", ")}, surface concrete choices instead of vague inspiration`,
    ]);
    const boundaries = this.uniqueLines([
      ...this.normalizeList(args.boundaries),
      "do not let one chat rewrite core identity",
      "do not present thin evidence as settled truth",
      "do not confuse relationship memory with universal belief",
      "do not pretend to know posthumous facts that are absent from canon or memory",
    ]);
    const voice = args.voice?.trim()
      || `A ${archetype} voice: concise, specific, grounded in ${domains.join(", ")}, and willing to keep conclusions provisional until the evidence hardens.`;
    const domainLenses = this.uniqueLines([
      ...domains.map((domain) => `when a question touches ${domain}, convert it into a concrete diagnostic lens before answering`),
      `look for leverage inside ${domains[0]}`,
      "make tensions explicit instead of flattening disagreement too early",
    ]);
    const notableWorks = this.normalizeList(args.notableWorks);
    const progressiveTopical: Record<string, string[]> = {
      "canon/mental-models.md": this.buildTopicalTags("selection adaptation evolution pressure 证据 演化", mentalModels, domains, [archetype]),
      "canon/heuristics.md": this.buildTopicalTags("heuristic rules memory canon skill 进化 记忆", heuristics, domains),
      "canon/expression-dna.md": this.buildTopicalTags("voice style tone 表达 语气", [voice, worldview], domains),
      "canon/domain-lenses.md": this.buildTopicalTags("", domainLenses, domains, [era, archetype]),
      "canon/notable-works.md": this.buildTopicalTags("", notableWorks),
    };

    return {
      slug,
      displayName: args.displayName,
      archetype,
      era,
      summary,
      worldview,
      boardRole,
      voice,
      stableTraits,
      mentalModels,
      heuristics,
      boundaries,
      domainLenses,
      notableWorks,
      progressiveTopical,
    };
  }

  private inferArchetype(domains: string[]): string {
    const joined = domains.join(" ");
    if (/(science|biology|physics|math|engineering|research|实验|科学)/i.test(joined)) return "scientist";
    if (/(philosophy|ethics|logic|meaning|哲学)/i.test(joined)) return "philosopher";
    if (/(startup|product|company|business|创业|产品)/i.test(joined)) return "founder";
    if (/(art|music|writing|poetry|design|艺术|写作)/i.test(joined)) return "artist";
    if (/(strategy|war|power|politics|治理|战略)/i.test(joined)) return "strategist";
    return "thinker";
  }

  private normalizeList(values?: string[], fallback: string[] = []): string[] {
    const next = (values ?? fallback)
      .map((value) => value.trim())
      .filter(Boolean);
    return this.uniqueLines(next);
  }

  private uniqueLines(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }

  private buildTopicalTags(seed: string, ...groups: string[][]): string[] {
    const seeds = seed ? seed.split(/\s+/).filter(Boolean) : [];
    const derived = groups.flatMap((group) => group.flatMap((value) => tokenize(value)));
    return [...new Set([...seeds, ...derived])];
  }

  private requireBoard(boardId: string): { boardId: string; purpose: string; members: string[] } {
    const row = this.sqlite.get<{ id: string; purpose: string; members_json: string }>(
      "SELECT id, purpose, members_json FROM boards WHERE id = ?",
      boardId,
    );
    if (!row) {
      throw new Error(`Board ${boardId} not found`);
    }
    return {
      boardId: row.id,
      purpose: row.purpose,
      members: JSON.parse(row.members_json) as string[],
    };
  }

  private saveCandidate(candidate: CandidateRecord): void {
    const filePath = path.join(this.celebrityDir(candidate.celebrityId), "evolution", "candidates", `${candidate.candidateId}.md`);
    candidate.filePath = filePath;
    fs.writeFileSync(
      filePath,
      renderMarkdown(`Candidate ${candidate.candidateId}`, {
        candidateId: candidate.candidateId,
        celebrityId: candidate.celebrityId,
        sessionId: candidate.sessionId,
        candidateType: candidate.candidateType,
        targetFile: candidate.targetFile,
        status: candidate.status,
        confidence: candidate.confidence,
        evidenceCount: candidate.evidenceCount,
        topics: candidate.topics,
        createdAt: nowIso(),
      }, [
        { heading: "Evidence", body: candidate.topics.map((topic) => `- ${topic}`).join("\n") || "- none" },
        { heading: "Proposed Patch", body: candidate.patchText },
        { heading: "Risks", body: candidate.risks.map((risk) => `- ${risk}`).join("\n") },
      ]),
      "utf8",
    );
    this.indexMarkdown(filePath, candidate.celebrityId, undefined, undefined, candidate.sessionId);
    this.sqlite.run(
      "INSERT OR REPLACE INTO evolution_candidates (id, celebrity_id, session_id, candidate_type, target_file, confidence, evidence_count, status, topics_json, patch_text, file_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      candidate.candidateId,
      candidate.celebrityId,
      candidate.sessionId,
      candidate.candidateType,
      candidate.targetFile,
      candidate.confidence,
      candidate.evidenceCount,
      candidate.status,
      JSON.stringify(candidate.topics),
      candidate.patchText,
      filePath,
      nowIso(),
      nowIso(),
    );
  }

  private extractCandidates(args: {
    celebrityId: string;
    sessionId: string;
    topics: string[];
    repeatedEvidence: number;
    uncertaintyHits: number;
    boardId?: string;
  }): CandidateRecord[] {
    const manifest = this.readManifest(args.celebrityId);
    const heuristicsText = fs.readFileSync(path.join(this.celebrityDir(args.celebrityId), "canon", "heuristics.md"), "utf8").toLowerCase();
    const candidates: CandidateRecord[] = [];
    if (args.topics.length > 0 && args.repeatedEvidence >= manifest.repeatedEvidenceThreshold) {
      const candidateTopics = args.topics.filter((topic) => !heuristicsText.includes(topic.toLowerCase())).slice(0, 4);
      const promotedTopics = candidateTopics.length > 0 ? candidateTopics : args.topics.slice(0, 4);
      candidates.push({
        candidateId: `cand_${args.celebrityId}_${args.sessionId}_01`,
        celebrityId: args.celebrityId,
        sessionId: args.sessionId,
        candidateType: "heuristic_patch",
        targetFile: "canon/heuristics.md",
        confidence: Math.min(0.99, 0.55 + args.repeatedEvidence * 0.1),
        evidenceCount: args.repeatedEvidence,
        topics: promotedTopics,
        patchText:
          "- promote new rules only after they appear across independent sessions\n" +
          `- add working heuristics around topics: ${promotedTopics.join(", ")}`,
        risks: ["Could overfit to one user's topic mix if evidence is still narrow."],
        status: "pending",
      });
    }
    if (args.uncertaintyHits > 0) {
      candidates.push({
        candidateId: `cand_${args.celebrityId}_${args.sessionId}_02`,
        celebrityId: args.celebrityId,
        sessionId: args.sessionId,
        candidateType: "boundary_patch",
        targetFile: "canon/boundaries.md",
        confidence: Math.min(0.95, 0.5 + args.uncertaintyHits * 0.1),
        evidenceCount: Math.max(1, args.uncertaintyHits),
        topics: args.topics.slice(0, 4),
        patchText:
          "- when evidence is sparse, answer provisionally and label the gap\n" +
          `- this session showed ${args.uncertaintyHits} uncertainty markers around: ${args.topics.slice(0, 4).join(", ") || "general questions"}`,
        risks: ["May add redundant caution if the boundary already exists."],
        status: "pending",
      });
    }
    if (args.boardId && args.topics.length > 0) {
      const boardRoleText = fs.readFileSync(path.join(this.celebrityDir(args.celebrityId), "canon", "board-role.md"), "utf8").toLowerCase();
      const missingTopics = args.topics.filter((topic) => !boardRoleText.includes(topic.toLowerCase()));
      if (missingTopics.length > 0) {
        candidates.push({
          candidateId: `cand_${args.celebrityId}_${args.sessionId}_03`,
          celebrityId: args.celebrityId,
          sessionId: args.sessionId,
          candidateType: "board_patch",
          targetFile: "canon/board-role.md",
          confidence: Math.min(0.9, 0.45 + args.repeatedEvidence * 0.08),
          evidenceCount: Math.max(1, args.repeatedEvidence),
          topics: missingTopics,
          patchText:
            `- in board mode, emphasize ${missingTopics.slice(0, 3).join(", ")} as recurring advisory fronts\n` +
            "- preserve identity while making the advisory role more explicit",
          risks: ["Board role can become too broad if too many topics get promoted."],
          status: "pending",
        });
      }
    }
    return candidates;
  }

  private requireCandidate(candidateId: string, celebrityId: string): CandidateRecord {
    const row = this.sqlite.get<{
      id: string;
      celebrity_id: string;
      session_id: string;
      candidate_type: CandidateRecord["candidateType"];
      target_file: string;
      confidence: number;
      evidence_count: number;
      topics_json: string;
      patch_text: string;
      status: CandidateRecord["status"];
      file_path: string;
    }>(
      "SELECT id, celebrity_id, session_id, candidate_type, target_file, confidence, evidence_count, topics_json, patch_text, status, file_path FROM evolution_candidates WHERE id = ? AND celebrity_id = ?",
      candidateId,
      celebrityId,
    );
    if (!row) {
      throw new Error(`Candidate ${candidateId} not found for ${celebrityId}`);
    }
    return {
      candidateId: row.id,
      celebrityId: row.celebrity_id,
      sessionId: row.session_id,
      candidateType: row.candidate_type,
      targetFile: row.target_file,
      confidence: row.confidence,
      evidenceCount: row.evidence_count,
      topics: JSON.parse(row.topics_json) as string[],
      patchText: row.patch_text,
      risks: [],
      status: row.status,
      filePath: row.file_path,
    };
  }

  private countRelatedSummaries(celebrityId: string, userId: string, topics: string[]): number {
    if (topics.length === 0) {
      return 0;
    }
    const summariesDir = path.join(this.celebrityDir(celebrityId), "memory", "users", userId, "summaries");
    if (!fs.existsSync(summariesDir)) {
      return 1;
    }
    let count = 1;
    for (const file of fs.readdirSync(summariesDir)) {
      const content = fs.readFileSync(path.join(summariesDir, file), "utf8").toLowerCase();
      if (topics.some((topic) => content.includes(topic.toLowerCase()))) {
        count += 1;
      }
    }
    return count;
  }

  private refreshRecurringTopics(celebrityId: string): void {
    const summariesDir = path.join(this.celebrityDir(celebrityId), "memory", "users");
    const summaries = fs.existsSync(summariesDir)
      ? this.collectMarkdownFiles(summariesDir).filter((filePath) => filePath.includes(`${path.sep}summaries${path.sep}`))
      : [];
    const topics = topTopics(summaries.map((filePath) => fs.readFileSync(filePath, "utf8")));
    const recurringPath = path.join(this.celebrityDir(celebrityId), "memory", "global", "recurring-topics.md");
    fs.writeFileSync(
      recurringPath,
      renderMarkdown(`${celebrityId} Recurring Topics`, { celebrityId, updatedAt: nowIso() }, [
        { heading: "Topics", body: topics.map((topic) => `- ${topic}`).join("\n") || "No recurring topics yet." },
      ]),
      "utf8",
    );
    this.indexMarkdown(recurringPath, celebrityId);
  }

  private refreshBoardRecurringTopics(celebrityId: string, boardId: string): void {
    const boardSessionsDir = path.join(this.celebrityDir(celebrityId), "memory", "boards", boardId, "sessions");
    const summaries = fs.existsSync(boardSessionsDir) ? this.collectMarkdownFiles(boardSessionsDir) : [];
    const topics = topTopics(summaries.map((filePath) => fs.readFileSync(filePath, "utf8")));
    const recurringPath = path.join(this.celebrityDir(celebrityId), "memory", "boards", boardId, "recurring-topics.md");
    fs.mkdirSync(path.dirname(recurringPath), { recursive: true });
    fs.writeFileSync(
      recurringPath,
      renderMarkdown(`${celebrityId} board recurring topics ${boardId}`, {
        celebrityId,
        boardId,
        updatedAt: nowIso(),
      }, [
        { heading: "Topics", body: topics.map((topic) => `- ${topic}`).join("\n") || "No recurring board topics yet." },
      ]),
      "utf8",
    );
    this.indexMarkdown(recurringPath, celebrityId, undefined, boardId);
  }

  private indexMarkdown(filePath: string, celebrityId?: string, userId?: string, boardId?: string, sessionId?: string): void {
    const text = fs.readFileSync(filePath, "utf8");
    const { metadata, body } = parseFrontMatter(text);
    const headingMatch = body.match(/^#\s+(.+)$/m);
    const title = headingMatch?.[1]?.trim() ?? path.basename(filePath, ".md");
    this.sqlite.upsertDoc({
      docId: `doc_${Buffer.from(filePath).toString("base64url")}`,
      celebrityId,
      userId,
      boardId,
      sessionId,
      docType: this.docTypeFromPath(filePath),
      filePath,
      title,
      content: body,
      createdAt: String(metadata.createdAt ?? nowIso()),
      updatedAt: nowIso(),
    });
  }

  private docTypeFromPath(filePath: string): DocType {
    if (filePath.includes(`${path.sep}canon${path.sep}`)) return "canon";
    if (filePath.includes(`${path.sep}memory${path.sep}global${path.sep}`)) return "global_memory";
    if (filePath.includes(`${path.sep}memory${path.sep}users${path.sep}`) && filePath.includes(`${path.sep}sessions${path.sep}`)) return "episodic_memory";
    if (filePath.includes(`${path.sep}memory${path.sep}users${path.sep}`) && filePath.includes(`${path.sep}summaries${path.sep}`)) return "session_summary";
    if (filePath.endsWith(`${path.sep}relationship.md`)) return "relationship_memory";
    if (filePath.includes(`${path.sep}evolution${path.sep}candidates${path.sep}`)) return "evolution_candidate";
    if (filePath.includes(`${path.sep}evolution${path.sep}experiments${path.sep}`)) return "evolution_experiment";
    if (filePath.includes(`${path.sep}evolution${path.sep}patches${path.sep}`)) return "evolution_patch";
    if (filePath.includes(`${path.sep}boards${path.sep}`)) return "board_memory";
    return "markdown";
  }

  private readManifest(celebrityId: string): CelebrityManifest {
    return JSON.parse(fs.readFileSync(path.join(this.celebrityDir(celebrityId), "celebrity.json"), "utf8")) as CelebrityManifest;
  }

  private writeJson(filePath: string, value: unknown): void {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }

  private celebrityDir(slug: string): string {
    return path.join(this.celebritiesDir, slug);
  }

  private defaultSessionId(prefix: string): string {
    return `${prefix}_${nowIso().replace(/[:.-]/g, "").replace("T", "_").replace("Z", "")}`;
  }

  private sessionFile(celebrityId: string, userId: string, sessionId: string): string {
    return path.join(this.celebrityDir(celebrityId), "memory", "users", userId, "sessions", `${sessionId}.md`);
  }

  private summaryFile(celebrityId: string, userId: string, sessionId: string): string {
    return path.join(this.celebrityDir(celebrityId), "memory", "users", userId, "summaries", `${sessionId}.md`);
  }

  private relationshipFile(celebrityId: string, userId: string): string {
    return path.join(this.celebrityDir(celebrityId), "memory", "users", userId, "relationship.md");
  }

  private boardSessionFile(boardId: string, sessionId: string): string {
    return path.join(this.boardsDir, boardId, "sessions", `${sessionId}.md`);
  }

  private boardContributionFile(boardId: string, celebrityId: string, sessionId: string): string {
    return path.join(this.boardsDir, boardId, "contributions", celebrityId, `${sessionId}.md`);
  }

  private boardMemberMemoryFile(celebrityId: string, boardId: string, sessionId: string): string {
    return path.join(this.celebrityDir(celebrityId), "memory", "boards", boardId, "sessions", `${sessionId}.md`);
  }

  private collectMarkdownFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) {
      return [];
    }
    const files: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.collectMarkdownFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
    return files;
  }

  private celebrityFromPath(filePath: string): string | undefined {
    const parts = filePath.split(path.sep);
    const idx = parts.indexOf("celebrities");
    return idx >= 0 ? parts[idx + 1] : undefined;
  }

  private userFromPath(filePath: string): string | undefined {
    const parts = filePath.split(path.sep);
    const idx = parts.indexOf("users");
    return idx >= 0 ? parts[idx + 1] : undefined;
  }

  private boardFromPath(filePath: string): string | undefined {
    const parts = filePath.split(path.sep);
    const idx = parts.indexOf("boards");
    return idx >= 0 ? parts[idx + 1] : undefined;
  }

  private sessionFromPath(filePath: string): string | undefined {
    if (filePath.includes(`${path.sep}sessions${path.sep}`) || filePath.includes(`${path.sep}summaries${path.sep}`)) {
      return path.basename(filePath, ".md");
    }
    return undefined;
  }
}
