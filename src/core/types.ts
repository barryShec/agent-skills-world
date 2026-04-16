export interface SessionTurnInput {
  celebrityId: string;
  userId: string;
  sessionId: string;
  userMessage: string;
  assistantMessage: string;
  boardId?: string;
  createdAt?: string;
}

export interface CelebritySeedInput {
  slug?: string;
  displayName: string;
  summary?: string;
  boardRole?: string;
  archetype?: string;
  era?: string;
  worldview?: string;
  voice?: string;
  domains?: string[];
  traits?: string[];
  heuristics?: string[];
  mentalModels?: string[];
  boundaries?: string[];
  notableWorks?: string[];
}

export interface CandidateRecord {
  candidateId: string;
  celebrityId: string;
  sessionId: string;
  candidateType: "heuristic_patch" | "boundary_patch" | "board_patch";
  targetFile: string;
  confidence: number;
  evidenceCount: number;
  topics: string[];
  patchText: string;
  risks: string[];
  status: "pending" | "approved" | "rejected" | "promoted";
  filePath?: string;
}

export interface EvaluationResult {
  candidateId: string;
  passed: boolean;
  scoreBefore: number;
  scoreAfter: number;
  notes: string;
  metrics: Record<string, number>;
}

export interface CelebrityManifest {
  slug: string;
  displayName: string;
  summary: string;
  currentVersion: string;
  createdAt: string;
  repeatedEvidenceThreshold: number;
  progressiveLoad: {
    always: string[];
    topical: Record<string, string[]>;
    userSummaryLimit: number;
    boardSummaryLimit: number;
  };
}

export interface ContextLoadResult {
  slug: string;
  selectedFiles: string[];
  topics: string[];
  promptBlock: string;
}

export interface BoardMemberContext {
  celebrityId: string;
  displayName: string;
  selectedFiles: string[];
  topics: string[];
  promptBlock: string;
}

export interface BoardConveneResult {
  boardId: string;
  sessionId: string;
  query: string;
  agendaPath: string;
  topics: string[];
  boardPromptBlock: string;
  members: BoardMemberContext[];
}

export interface BoardFinalizeResult {
  boardId: string;
  sessionId: string;
  sessionPath: string;
  topics: string[];
  memberMemoryPaths: string[];
}
