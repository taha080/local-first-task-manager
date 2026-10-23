/** Lifecycle stored on a task. Completed tasks remain until they are deleted. */
export type TaskStatus = 'active' | 'completed';

/** Coarse priority used for display and sorting. */
export type Priority = 'low' | 'medium' | 'high';

/** Sidebar status view. `all` is not stored on the task. */
export type StatusFilter = 'all' | TaskStatus;

/** Priority view. `all` leaves every priority visible. */
export type PriorityFilter = 'all' | Priority;

/**
 * A task as stored in IndexedDB and written to export files.
 *
 * `createdAt`, `updatedAt`, and `completedAt` are UTC timestamps from
 * `Date.prototype.toISOString()` (`YYYY-MM-DDTHH:mm:ss.sssZ`).
 * `dueDate` is a calendar date (`YYYY-MM-DD`) with no time and no zone,
 * so it matches the value of an HTML date input.
 */
export interface Task {
  id: string;
  title: string;
  notes: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

/** What the form collects. Ids and timestamps are filled in by `createTask`. */
export interface TaskInput {
  title: string;
  notes?: string;
  priority?: Priority;
  dueDate?: string | null;
  tags?: string[];
}

/** Partial edit. Omitted fields stay as they are. `dueDate: null` clears a date. */
export interface TaskPatch {
  title?: string;
  notes?: string;
  priority?: Priority;
  dueDate?: string | null;
  tags?: string[];
}

export const PRIORITIES = ['low', 'medium', 'high'] as const;

/** Shared limits for the form, the database, and import files. */
export const LIMITS = {
  title: 200,
  notes: 5000,
  tagLength: 40,
  tagCount: 12,
  id: 80,
  importTasks: 5000,
  importChars: 2_000_000,
} as const;
