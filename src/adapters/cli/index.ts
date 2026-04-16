import path from "node:path";
import { AgentSkillsWorld, nowIso, slugify } from "../../core/world.js";

function requireValue(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return value;
}

function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseJsonObject(value: string | undefined): Record<string, string> | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--member-notes must be a JSON object");
  }
  return Object.fromEntries(
    Object.entries(parsed).map(([key, current]) => [key, String(current)]),
  );
}

function parseFlags(argv: string[]): { command: string[]; flags: Map<string, string> } {
  const command: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      command.push(token);
      continue;
    }
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      flags.set(key, "true");
      continue;
    }
    flags.set(key, value);
    i += 1;
  }
  return { command, flags };
}

export async function runCli(argv: string[]): Promise<void> {
  const { command, flags } = parseFlags(argv);
  const root = path.resolve(flags.get("root") ?? process.cwd());
  const world = new AgentSkillsWorld(root);

  if (command[0] === "bootstrap") {
    console.log(JSON.stringify(world.bootstrap(), null, 2));
    return;
  }

  if (command[0] === "celebrity" && command[1] === "create") {
    const name = requireValue(flags.get("name"), "--name");
    const celebrityDir = world.createCelebrity({
      slug: flags.get("slug") ?? slugify(name),
      displayName: name,
      summary: requireValue(flags.get("summary"), "--summary"),
      boardRole: requireValue(flags.get("board-role"), "--board-role"),
      domains: parseCsv(flags.get("domains")),
      traits: parseCsv(flags.get("traits")),
      notableWorks: parseCsv(flags.get("works")),
    });
    console.log(celebrityDir);
    return;
  }

  if (command[0] === "celebrity" && command[1] === "generate") {
    const name = requireValue(flags.get("name"), "--name");
    const celebrityDir = world.createCelebrity({
      slug: flags.get("slug") ?? slugify(name),
      displayName: name,
      summary: flags.get("summary"),
      boardRole: flags.get("board-role"),
      archetype: flags.get("archetype"),
      era: flags.get("era"),
      worldview: flags.get("worldview"),
      voice: flags.get("voice"),
      domains: parseCsv(flags.get("domains")),
      traits: parseCsv(flags.get("traits")),
      heuristics: parseCsv(flags.get("heuristics")),
      mentalModels: parseCsv(flags.get("mental-models")),
      boundaries: parseCsv(flags.get("boundaries")),
      notableWorks: parseCsv(flags.get("works")),
    });
    console.log(celebrityDir);
    return;
  }

  if (command[0] === "board" && command[1] === "create") {
    const boardDir = world.createBoard({
      boardId: requireValue(flags.get("board-id"), "--board-id"),
      members: parseCsv(requireValue(flags.get("members"), "--members")),
      purpose: requireValue(flags.get("purpose"), "--purpose"),
    });
    console.log(boardDir);
    return;
  }

  if (command[0] === "board" && command[1] === "convene") {
    const result = world.conveneBoard({
      boardId: requireValue(flags.get("board-id"), "--board-id"),
      query: requireValue(flags.get("query"), "--query"),
      userId: flags.get("user-id"),
      sessionId: flags.get("session-id"),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command[0] === "board" && command[1] === "finalize") {
    const result = world.finalizeBoardSession({
      boardId: requireValue(flags.get("board-id"), "--board-id"),
      sessionId: requireValue(flags.get("session-id"), "--session-id"),
      query: requireValue(flags.get("query"), "--query"),
      synthesis: requireValue(flags.get("synthesis"), "--synthesis"),
      userId: flags.get("user-id"),
      memberNotes: parseJsonObject(flags.get("member-notes")),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command[0] === "chat" && command[1] === "log-turn") {
    const filePath = world.logTurn({
      celebrityId: requireValue(flags.get("slug"), "--slug"),
      userId: requireValue(flags.get("user-id"), "--user-id"),
      sessionId: requireValue(flags.get("session-id"), "--session-id"),
      userMessage: requireValue(flags.get("user-message"), "--user-message"),
      assistantMessage: requireValue(flags.get("assistant-message"), "--assistant-message"),
      boardId: flags.get("board-id"),
      createdAt: nowIso(),
    });
    console.log(filePath);
    return;
  }

  if (command[0] === "chat" && command[1] === "finalize") {
    const result = world.finalizeSession({
      celebrityId: requireValue(flags.get("slug"), "--slug"),
      userId: requireValue(flags.get("user-id"), "--user-id"),
      sessionId: requireValue(flags.get("session-id"), "--session-id"),
      boardId: flags.get("board-id"),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command[0] === "context" && command[1] === "load") {
    const result = world.progressiveLoad({
      celebrityId: requireValue(flags.get("slug"), "--slug"),
      query: requireValue(flags.get("query"), "--query"),
      userId: flags.get("user-id"),
      boardId: flags.get("board-id"),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command[0] === "memory" && command[1] === "search") {
    const result = world.searchMemory({
      celebrityId: requireValue(flags.get("slug"), "--slug"),
      query: requireValue(flags.get("query"), "--query"),
      limit: Number.parseInt(flags.get("limit") ?? "5", 10),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command[0] === "evolution" && command[1] === "list") {
    console.log(JSON.stringify(world.listCandidates(requireValue(flags.get("slug"), "--slug")), null, 2));
    return;
  }

  if (command[0] === "evolution" && command[1] === "evaluate") {
    console.log(JSON.stringify(world.evaluateCandidate({
      celebrityId: requireValue(flags.get("slug"), "--slug"),
      candidateId: requireValue(flags.get("candidate-id"), "--candidate-id"),
    }), null, 2));
    return;
  }

  if (command[0] === "evolution" && command[1] === "promote") {
    console.log(world.promoteCandidate({
      celebrityId: requireValue(flags.get("slug"), "--slug"),
      candidateId: requireValue(flags.get("candidate-id"), "--candidate-id"),
    }));
    return;
  }

  if (command[0] === "reindex") {
    console.log(JSON.stringify({ reindexed: world.reindexAll() }, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command.join(" ") || "(empty)"}`);
}
