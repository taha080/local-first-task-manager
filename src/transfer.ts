/**
 * JSON backup format shared by Export and Import.
 * Import copies only known fields and checks every one, so a hand-edited
 * file cannot smuggle extra properties into IndexedDB.
 */

import {
  readCompletedField,
  readDueField,
  readId,
  readNotesField,
  readPriorityField,
  readStatusField,
  readTagsField,
  readTimestamp,
  readTitle,
  TaskValidationError,
} from './task';
import { LIMITS, type Task } from './types';

export const EXPORT_VERSION = 1;
export const EXPORT_APP = 'local-first-task-manager';

export interface TaskExportFile {
  version: typeof EXPORT_VERSION;
  app: typeof EXPORT_APP;
  exportedAt: string;
  tasks: Task[];
}

export interface ImportSuccess {
  ok: true;
  tasks: Task[];
  exportedAt: string;
}

export interface ImportFailure {
  ok: false;
  errors: string[];
}

export type ImportResult = ImportSuccess | ImportFailure;

export function serializeTasks(tasks: readonly Task[], now = new Date()): string {
  const file: TaskExportFile = {
    version: EXPORT_VERSION,
    app: EXPORT_APP,
    exportedAt: now.toISOString(),
    tasks: tasks.map(copyTask),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * Validate a backup. Never throws: bad files return `{ ok: false, errors }`.
 * A valid file may contain zero tasks, which imports as an empty list.
 */
export function parseImport(raw: string): ImportResult {
  if (typeof raw !== 'string') {
    return failure(['Import must be a JSON string.']);
  }
  if (raw.length > LIMITS.importChars) {
    return failure([`Import file must be ${LIMITS.importChars} characters or fewer.`]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return failure(['Import file is not valid JSON.']);
  }
  if (!isRecord(parsed)) {
    return failure(['Import file must be a JSON object.']);
  }

  const errors: string[] = [];
  if (parsed.version !== EXPORT_VERSION) {
    errors.push(`Unsupported export version. Expected ${EXPORT_VERSION}.`);
  }
  if (parsed.app !== EXPORT_APP) {
    errors.push(`Unexpected app id. Expected "${EXPORT_APP}".`);
  }

  const exportedAt = parsed.exportedAt;
  if (typeof exportedAt !== 'string' || !isExportTimestamp(exportedAt)) {
    errors.push('exportedAt must be an ISO-8601 UTC timestamp.');
  }

  if (!Array.isArray(parsed.tasks)) {
    errors.push('tasks must be an array.');
    return failure(errors);
  }
  if (parsed.tasks.length > LIMITS.importTasks) {
    errors.push(`A file can contain at most ${LIMITS.importTasks} tasks.`);
    return failure(errors);
  }

  const tasks: Task[] = [];
  const seenIds = new Set<string>();
  parsed.tasks.forEach((value, index) => {
    const task = readImportedTask(value, index, errors);
    if (!task) return;
    if (seenIds.has(task.id)) {
      errors.push(`tasks[${index}]: duplicate id "${task.id}".`);
      return;
    }
    seenIds.add(task.id);
    tasks.push(task);
  });

  if (errors.length > 0 || typeof exportedAt !== 'string') return failure(errors);
  return { ok: true, tasks, exportedAt };
}

function readImportedTask(value: unknown, index: number, errors: string[]): Task | null {
  const label = `tasks[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${label}: must be an object.`);
    return null;
  }

  const before = errors.length;
  const id = capture(errors, label, () => readId(value.id));
  const title = capture(errors, label, () => readTitle(value.title));
  const notes = capture(errors, label, () => readNotesField(value.notes));
  const status = capture(errors, label, () => readStatusField(value.status));
  const priority = capture(errors, label, () => readPriorityField(value.priority));
  const dueDate = capture(errors, label, () => readDueField(value.dueDate));
  const tags = capture(errors, label, () => readTagsField(value.tags));
  const createdAt = capture(errors, label, () => readTimestamp(value.createdAt, 'createdAt'));
  const updatedAt = capture(errors, label, () => readTimestamp(value.updatedAt, 'updatedAt'));
  const completedAt =
    status === undefined
      ? undefined
      : capture(errors, label, () => readCompletedField(status, value.completedAt));

  if (
    errors.length !== before ||
    id === undefined ||
    title === undefined ||
    notes === undefined ||
    status === undefined ||
    priority === undefined ||
    dueDate === undefined ||
    tags === undefined ||
    createdAt === undefined ||
    updatedAt === undefined ||
    completedAt === undefined
  ) {
    return null;
  }

  return {
    id,
    title,
    notes,
    status,
    priority,
    dueDate,
    tags,
    createdAt,
    updatedAt,
    completedAt,
  };
}

function capture<T>(errors: string[], label: string, read: () => T): T | undefined {
  try {
    return read();
  } catch (error) {
    const message = error instanceof TaskValidationError ? error.message : 'Invalid value.';
    errors.push(`${label}: ${message}`);
    return undefined;
  }
}

function failure(errors: string[]): ImportFailure {
  return { ok: false, errors };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isExportTimestamp(value: string): boolean {
  try {
    readTimestamp(value, 'exportedAt');
    return true;
  } catch {
    return false;
  }
}

function copyTask(task: Task): Task {
  return {
    id: task.id,
    title: task.title,
    notes: task.notes,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    tags: [...task.tags],
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt,
  };
}
