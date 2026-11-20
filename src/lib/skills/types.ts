/** Kiểu dùng chung của lõi phân tích skill. Không phụ thuộc DOM hay framework. */

export interface VFile {
  path: string;
  size: number;
  /** File nhị phân hoặc không đọc (quá lớn): chỉ có `size`, không có `text`. */
  binary: boolean;
  text?: string;
}
/** Hệ file ảo: đường dẫn posix (không bắt đầu bằng `/`) → file. */
export type Vfs = Map<string, VFile>;

export type Severity = 'note' | 'review';
export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  file?: string;
  line?: number;
}

export interface TokenLevels {
  /** name + description, nạp ở mọi phiên */
  always: number;
  /** cả SKILL.md, nạp khi skill được kích hoạt */
  trigger: number;
  /** mọi file văn bản trong skill */
  all: number;
}

export type FileKind = 'skill' | 'doc' | 'script' | 'asset' | 'other';
export interface FileInfo {
  path: string;
  size: number;
  tokens: number;
  kind: FileKind;
  /** số phát hiện gắn với file này */
  flags: number;
}

export interface ScriptFinding {
  ruleId: string;
  severity: Severity;
  line: number;
  message: string;
}
export interface ScriptReport {
  path: string;
  findings: ScriptFinding[];
}

export interface SkillReport {
  dir: string;
  name: string | null;
  description: string | null;
  findings: Finding[];
  tokens: TokenLevels;
  files: FileInfo[];
  /** mọi script trong skill kèm phát hiện của từng file (kể cả mức note) */
  scripts: ScriptReport[];
}

export interface CollectionReport {
  skills: SkillReport[];
  /** tổng token mức `always` của mọi skill */
  alwaysTotal: number;
  fileCount: number;
}

/** Giới hạn khi nhập, để một repo hay zip khổng lồ không làm treo trình duyệt. */
export interface Limits {
  maxEntries: number;
  /** file văn bản lớn hơn mức này chỉ được liệt kê, không đọc */
  maxFileBytes: number;
  /** tổng dung lượng văn bản đọc vào */
  maxTotalBytes: number;
  /** tổng dung lượng giải nén của zip (chống zip bomb) */
  maxUnzipBytes: number;
}
export const DEFAULT_LIMITS: Limits = {
  maxEntries: 5000,
  maxFileBytes: 512 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
  maxUnzipBytes: 50 * 1024 * 1024,
};

export type ImportErrorCode = 'not-found' | 'rate-limited' | 'too-large' | 'network' | 'bad-zip' | 'not-skill';
export class ImportError extends Error {
  readonly code: ImportErrorCode;
  /** Với `rate-limited`: thời điểm (ms epoch) GitHub cho gọi lại. */
  readonly resetAt: number | undefined;
  constructor(code: ImportErrorCode, message: string, resetAt?: number) {
    super(message);
    this.name = 'ImportError';
    this.code = code;
    this.resetAt = resetAt;
  }
}
