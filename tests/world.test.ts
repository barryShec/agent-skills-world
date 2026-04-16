import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AgentSkillsWorld } from "../src/core/world.js";

function makeWorld(): { root: string; world: AgentSkillsWorld } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-skills-world-"));
  const world = new AgentSkillsWorld(root);
  world.bootstrap();
  return { root, world };
}

test("bootstrap creates Darwin celebrity directory", () => {
  const { root } = makeWorld();
  assert.equal(fs.existsSync(path.join(root, "world", "celebrities", "darwin", "celebrity.json")), true);
  assert.equal(fs.existsSync(path.join(root, "world", "celebrities", "darwin", "canon", "SKILL.md")), true);
});

test("finalize session creates Darwin candidates", () => {
  const { world } = makeWorld();
  world.logTurn({
    celebrityId: "darwin",
    userId: "user_001",
    sessionId: "sess_001",
    userMessage: "How should skill evolution handle repeated evidence?",
    assistantMessage: "Repeated evidence across sessions should outweigh novelty.",
  });
  world.logTurn({
    celebrityId: "darwin",
    userId: "user_001",
    sessionId: "sess_001",
    userMessage: "Should a single chat rewrite canon?",
    assistantMessage: "No. One chat is not enough evidence.",
  });
  const result = world.finalizeSession({ celebrityId: "darwin", userId: "user_001", sessionId: "sess_001" });
  assert.equal(result.candidateIds.includes("cand_darwin_sess_001_01"), true);
});

test("progressive loader selects relevant files and relationship memory", () => {
  const { world } = makeWorld();
  world.logTurn({
    celebrityId: "darwin",
    userId: "user_001",
    sessionId: "sess_001",
    userMessage: "How should memory evolve without changing canon?",
    assistantMessage: "Memory should accumulate as evidence, not overwrite identity.",
  });
  world.finalizeSession({ celebrityId: "darwin", userId: "user_001", sessionId: "sess_001" });
  const loaded = world.progressiveLoad({
    celebrityId: "darwin",
    userId: "user_001",
    query: "How should memory evolve without changing canon?",
  });
  assert.equal(loaded.selectedFiles.some((filePath) => filePath.endsWith("canon/heuristics.md")), true);
  assert.equal(loaded.selectedFiles.some((filePath) => filePath.endsWith("relationship.md")), true);
});

test("approved candidate promotes and bumps version", () => {
  const { root, world } = makeWorld();
  world.logTurn({
    celebrityId: "darwin",
    userId: "user_001",
    sessionId: "sess_001",
    userMessage: "How should skill evolution handle repeated evidence?",
    assistantMessage: "Repeated evidence across sessions should outweigh novelty.",
  });
  world.logTurn({
    celebrityId: "darwin",
    userId: "user_001",
    sessionId: "sess_001",
    userMessage: "Should repeated evidence matter more than one lucky chat?",
    assistantMessage: "Yes, repeated evidence is the safer selector.",
  });
  world.finalizeSession({ celebrityId: "darwin", userId: "user_001", sessionId: "sess_001" });
  const result = world.evaluateCandidate({ celebrityId: "darwin", candidateId: "cand_darwin_sess_001_01" });
  assert.equal(result.passed, true);
  const patchPath = world.promoteCandidate({ celebrityId: "darwin", candidateId: "cand_darwin_sess_001_01" });
  assert.equal(fs.existsSync(patchPath), true);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "world", "celebrities", "darwin", "celebrity.json"), "utf8")) as { currentVersion: string };
  assert.equal(manifest.currentVersion, "1.0.1");
});

test("celebrity generator creates richer canon slices", () => {
  const { root, world } = makeWorld();
  const dir = world.createCelebrity({
    displayName: "Ada Lovelace",
    archetype: "scientist",
    domains: ["mathematics", "computing", "systems"],
    traits: ["compresses abstractions into mechanisms"],
    notableWorks: ["Notes on the Analytical Engine"],
  });
  assert.equal(fs.existsSync(path.join(dir, "canon", "domain-lenses.md")), true);
  assert.equal(fs.existsSync(path.join(dir, "canon", "notable-works.md")), true);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "world", "celebrities", "ada-lovelace", "celebrity.json"), "utf8")) as {
    progressiveLoad: { topical: Record<string, string[]> };
  };
  assert.equal(Array.isArray(manifest.progressiveLoad.topical["canon/domain-lenses.md"]), true);
});

test("board convene assembles member contexts", () => {
  const { world } = makeWorld();
  world.createCelebrity({
    displayName: "Ada Lovelace",
    domains: ["mathematics", "computing"],
  });
  world.createBoard({
    boardId: "genius-board",
    members: ["darwin", "ada-lovelace"],
    purpose: "Help the user think through durable product and research decisions.",
  });
  const result = world.conveneBoard({
    boardId: "genius-board",
    query: "How should a persistent skill evolve without losing identity?",
    userId: "user_001",
    sessionId: "board_001",
  });
  assert.equal(result.members.length, 2);
  assert.equal(result.members.some((member) => member.celebrityId === "ada-lovelace"), true);
  assert.equal(fs.existsSync(result.agendaPath), true);
  assert.match(result.boardPromptBlock, /MEMBER: darwin/i);
});

test("board finalize writes member board memory and progressive load can see it", () => {
  const { world } = makeWorld();
  world.createCelebrity({
    displayName: "Ada Lovelace",
    domains: ["mathematics", "computing"],
  });
  world.createBoard({
    boardId: "genius-board",
    members: ["darwin", "ada-lovelace"],
    purpose: "Help the user think through durable product and research decisions.",
  });
  world.conveneBoard({
    boardId: "genius-board",
    query: "How should a persistent skill evolve without losing identity?",
    userId: "user_001",
    sessionId: "board_001",
  });
  const result = world.finalizeBoardSession({
    boardId: "genius-board",
    sessionId: "board_001",
    query: "How should a persistent skill evolve without losing identity?",
    synthesis: "Keep canon stable, let memory accumulate, and let Darwin promote only repeated evidence.",
    userId: "user_001",
    memberNotes: {
      darwin: "Selection pressure should be explicit.",
      "ada-lovelace": "Turn abstract rules into mechanisms and representations.",
    },
  });
  assert.equal(result.memberMemoryPaths.length, 2);
  assert.equal(result.memberMemoryPaths.every((filePath) => fs.existsSync(filePath)), true);

  const loaded = world.progressiveLoad({
    celebrityId: "darwin",
    userId: "user_001",
    boardId: "genius-board",
    query: "How should a persistent skill evolve without losing identity?",
  });
  assert.equal(loaded.selectedFiles.some((filePath) => filePath.includes("/memory/boards/genius-board/sessions/board_001.md")), true);
  assert.equal(loaded.selectedFiles.some((filePath) => filePath.includes("/world/boards/genius-board/sessions/board_001.md")), true);
});
