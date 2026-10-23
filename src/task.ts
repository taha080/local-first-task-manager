/**
 * Pure task rules: validation, creation, edits, completion, and list ordering.
 * Nothing in this file touches IndexedDB or the DOM, so the tests can run in Node.
 */

import {
  LIMITS,
  PRIORITIES,
  type Priority,
  type PriorityFilter,
  type StatusFilter,
  type Task,
  type TaskInput,
  type TaskPatch,
  type TaskStatus,
} from './types';

export class TaskValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string | string[]) {
    const list = Array.isArray(issues) ? issues : [issues];
    super(list[0] ?? 'Invalid task.');
    this.name = 'TaskValidationError';
    this.issues = list;
  }
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ID_PATTERN = new RegExp(`^[A-Za-z0-9_-]{1,${LIMITS.id}}$`);

const PRIORITY_RANK: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function isPriority(value: unknown): value is Priority {
  return PRIORITIES.some((priority) => priority === value);
}

export function isStatusFilter(value: string): value is StatusFilter {
  return value === 'all' || value === 'active' || value === 'completed';
}

export function isPriorityFilter(value: string): value is PriorityFilter {
  return value === 'all' || isPriority(value);
}

/** Canonical UTC timestamp, the same shape `Date#toISOString()` emits. */
export function isIsoTimestamp(value: string): boolean {
  if (!ISO_TIMESTAMP.test(value)) return false;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return false;
  return new Date(parsed).toISOString() === value;
}

/** Real calendar date. Rejects overflow such as 2026-02-31. */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function localIsoDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function readTitle(value: unknown): string {
  if (typeof value !== 'string') throw new TaskValidationError('Title is required.');
  const title = value.trim().replace(/\s+/g, ' ');
  if (!title) throw new TaskValidationError('Title is required.');
  if (title.length > LIMITS.title) {
    throw new TaskValidationError(`Title must be ${LIMITS.title} characters or fewer.`);
  }
  return title;
}

export function normalizeNotes(value: string | undefined): string {
  const notes = (value ?? '').trim();
  if (notes.length > LIMITS.notes) {
    throw new TaskValidationError(`Notes must be ${LIMITS.notes} characters or fewer.`);
  }
  return notes;
}

export function readNotesField(value: unknown): string {
  if (typeof value !== 'string') throw new TaskValidationError('Notes must be a string.');
  return normalizeNotes(value);
}

export function normalizeTags(value: readonly string[] | undefined): string[] {
  if (value === undefined) return [];
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== 'string') throw new TaskValidationError('Tags must be a list of strings.');
    const tag = raw.trim().replace(/\s+/g, ' ');
    if (!tag) continue;
    if (tag.length > LIMITS.tagLength) {
      throw new TaskValidationError(`Each tag must be ${LIMITS.tagLength} characters or fewer.`);
    }
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  if (tags.length > LIMITS.tagCount) {
    throw new TaskValidationError(`A task can have at most ${LIMITS.tagCount} tags.`);
  }
  return tags;
}

export function readTagsField(value: unknown): string[] {
  if (!Array.isArray(value)) throw new TaskValidationError('Tags must be a list of strings.');
  return normalizeTags(value);
}

/** Comma-separated form field. Empty pieces are dropped. */
export function parseTagsInput(value: string): string[] {
  return normalizeTags(value.split(','));
}

export function normalizePriority(value: Priority | undefined): Priority {
  if (value === undefined) return 'medium';
  if (!isPriority(value)) throw new TaskValidationError('Priority must be low, medium, or high.');
  return value;
}

export function readPriorityField(value: unknown): Priority {
  if (!isPriority(value)) throw new TaskValidationError('Priority must be low, medium, or high.');
  return value;
}

export function normalizeDueDate(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (!isIsoDate(value)) {
    throw new TaskValidationError('Due date must be a real calendar date (YYYY-MM-DD).');
  }
  return value;
}

export function readDueField(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !isIsoDate(value)) {
    throw new TaskValidationError('Due date must be a YYYY-MM-DD string or null.');
  }
  return value;
}

export function readId(value: unknown): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw new TaskValidationError(
      `Id must be 1–${LIMITS.id} characters and use only letters, numbers, "_" or "-".`,
    );
  }
  return value;
}

export function readStatusField(value: unknown): TaskStatus {
  if (value === 'active' || value === 'completed') return value;
  throw new TaskValidationError('Status must be active or completed.');
}

export function readTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || !isIsoTimestamp(value)) {
    throw new TaskValidationError(`${label} must be an ISO-8601 UTC timestamp.`);
  }
  return value;
}

export function readCompletedField(status: TaskStatus, value: unknown): string | null {
  if (status === 'active') {
    if (value !== null) throw new TaskValidationError('Active tasks must set completedAt to null.');
    return null;
  }
  return readTimestamp(value, 'completedAt');
}

export function createTask(input: TaskInput, now = new Date()): Task {
  const timestamp = now.toISOString();
  return {
    id: crypto.randomUUID(),
    title: readTitle(input.title),
    notes: normalizeNotes(input.notes),
    status: 'active',
    priority: normalizePriority(input.priority),
    dueDate: normalizeDueDate(input.dueDate),
    tags: normalizeTags(input.tags),
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
  };
}

export function applyPatch(task: Task, patch: TaskPatch, now = new Date()): Task {
  return {
    ...task,
    title: patch.title === undefined ? task.title : readTitle(patch.title),
    notes: patch.notes === undefined ? task.notes : normalizeNotes(patch.notes),
    priority: patch.priority === undefined ? task.priority : normalizePriority(patch.priority),
    dueDate: patch.dueDate === undefined ? task.dueDate : normalizeDueDate(patch.dueDate),
    tags: patch.tags === undefined ? task.tags : normalizeTags(patch.tags),
    updatedAt: now.toISOString(),
  };
}

/**
 * Completing keeps the task. Reopening clears `completedAt`.
 * Calling this with the status the task already has returns the same object.
 */
export function setCompleted(task: Task, completed: boolean, now = new Date()): Task {
  const nextStatus: TaskStatus = completed ? 'completed' : 'active';
  if (task.status === nextStatus) return task;
  const timestamp = now.toISOString();
  return {
    ...task,
    status: nextStatus,
    completedAt: completed ? timestamp : null,
    updatedAt: timestamp,
  };
}

export interface TaskQuery {
  status?: StatusFilter;
  priority?: PriorityFilter;
}

/**
 * Active tasks come first. Dated tasks come before undated ones, soonest first.
 * Priority breaks remaining ties (high, then medium, then low), then recent edits.
 */
export function queryTasks(tasks: readonly Task[], query: TaskQuery = {}): Task[] {
  const status = query.status ?? 'all';
  const priority = query.priority ?? 'all';
  return tasks
    .filter((task) => {
      if (status !== 'all' && task.status !== status) return false;
      if (priority !== 'all' && task.priority !== priority) return false;
      return true;
    })
    .sort(compareTasks);
}

export function countByStatus(tasks: readonly Task[]): Record<StatusFilter, number> {
  let active = 0;
  let completed = 0;
  for (const task of tasks) {
    if (task.status === 'completed') completed += 1;
    else active += 1;
  }
  return { all: tasks.length, active, completed };
}

export function isOverdue(task: Task, today = localIsoDate()): boolean {
  return task.status === 'active' && task.dueDate !== null && task.dueDate < today;
}

export function formatDueDate(dueDate: string): string {
  const match = ISO_DATE.exec(dueDate);
  if (!match) return dueDate;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

export function dueLabel(task: Task, today: string): string | null {
  if (!task.dueDate) return null;
  const formatted = formatDueDate(task.dueDate);
  if (task.status === 'completed') return `Was due ${formatted}`;
  if (task.dueDate === today) return 'Due today';
  if (isOverdue(task, today)) return `Overdue · ${formatted}`;
  return `Due ${formatted}`;
}

function compareTasks(a: Task, b: Task): number {
  if (a.status !== b.status) return a.status === 'active' ? -1 : 1;

  // A missing due date sorts after every real date. ISO dates compare as text.
  const aDue = a.dueDate ?? '9999-99-99';
  const bDue = b.dueDate ?? '9999-99-99';
  if (aDue !== bDue) return aDue < bDue ? -1 : 1;

  const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (byPriority !== 0) return byPriority;

  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  if (a.title !== b.title) return a.title < b.title ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}
