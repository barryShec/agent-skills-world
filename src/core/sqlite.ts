import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS celebrities (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  current_version TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS celebrity_versions (
  id TEXT PRIMARY KEY,
  celebrity_id TEXT NOT NULL,
  version TEXT NOT NULL,
  parent_version TEXT,
  created_at TEXT NOT NULL,
  promoted_from_candidate_id TEXT,
  changelog TEXT,
  UNIQUE(celebrity_id, version)
);

CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  members_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY,
  celebrity_id TEXT,
  user_id TEXT,
  board_id TEXT,
  session_id TEXT,
  doc_type TEXT NOT NULL,
  file_path TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
  title,
  content,
  content='docs',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS docs_fts_insert AFTER INSERT ON docs BEGIN
  INSERT INTO docs_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS docs_fts_delete AFTER DELETE ON docs BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, title, content) VALUES('delete', old.rowid, old.title, old.content);
END;

CREATE TRIGGER IF NOT EXISTS docs_fts_update AFTER UPDATE ON docs BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, title, content) VALUES('delete', old.rowid, old.title, old.content);
  INSERT INTO docs_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;

CREATE TABLE IF NOT EXISTS session_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  celebrity_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  board_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_turns_session ON session_turns(celebrity_id, user_id, session_id, created_at);

CREATE TABLE IF NOT EXISTS evolution_candidates (
  id TEXT PRIMARY KEY,
  celebrity_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  candidate_type TEXT NOT NULL,
  target_file TEXT NOT NULL,
  confidence REAL NOT NULL,
  evidence_count INTEGER NOT NULL,
  status TEXT NOT NULL,
  topics_json TEXT NOT NULL,
  patch_text TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  score_before REAL,
  score_after REAL,
  evaluation_notes TEXT
);

CREATE TABLE IF NOT EXISTS evolution_experiments (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  passed INTEGER NOT NULL,
  score_before REAL NOT NULL,
  score_after REAL NOT NULL,
  notes TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

export class SQLiteWorldIndex {
  readonly db: DatabaseSync;

  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA journal_mode=WAL;");
    this.db.exec("PRAGMA busy_timeout=3000;");
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  run(sql: string, ...params: unknown[]): void {
    this.db.prepare(sql).run(...(params as never[]));
  }

  get<T extends object>(sql: string, ...params: unknown[]): T | undefined {
    return this.db.prepare(sql).get(...(params as never[])) as T | undefined;
  }

  all<T extends object>(sql: string, ...params: unknown[]): T[] {
    return this.db.prepare(sql).all(...(params as never[])) as T[];
  }

  upsertDoc(args: {
    docId: string;
    celebrityId?: string;
    userId?: string;
    boardId?: string;
    sessionId?: string;
    docType: string;
    filePath: string;
    title: string;
    content: string;
    createdAt: string;
    updatedAt: string;
  }): void {
    this.run(
      `INSERT INTO docs (
        id, celebrity_id, user_id, board_id, session_id, doc_type, file_path,
        title, content, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        id=excluded.id,
        celebrity_id=excluded.celebrity_id,
        user_id=excluded.user_id,
        board_id=excluded.board_id,
        session_id=excluded.session_id,
        doc_type=excluded.doc_type,
        title=excluded.title,
        content=excluded.content,
        updated_at=excluded.updated_at`,
      args.docId,
      args.celebrityId ?? null,
      args.userId ?? null,
      args.boardId ?? null,
      args.sessionId ?? null,
      args.docType,
      args.filePath,
      args.title,
      args.content,
      args.createdAt,
      args.updatedAt,
    );
  }
}
