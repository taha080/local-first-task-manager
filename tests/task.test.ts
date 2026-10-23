import { describe, expect, it } from 'vitest';
import {
  applyPatch,
  countByStatus,
  createTask,
  dueLabel,
  formatDueDate,
  isOverdue,
  localIsoDate,
  parseTagsInput,
  queryTasks,
  setCompleted,
  TaskValidationError,
} from '../src/task';
import { sampleTask } from './fixtures';

const now = new Date('2026-10-23T12:00:00.000Z');

describe('createTask', () => {
  it('fills defaults and normalizes the title, notes, and tags', () => {
    const task = createTask(
      {
        title: '  Write   spec  ',
        notes: '  line one\nline two  ',
        tags: [' Home ', 'home', 'errands', ''],
        dueDate: '',
      },
      now,
    );

    expect(task.title).toBe('Write spec');
    expect(task.notes).toBe('line one\nline two');
    expect(task.tags).toEqual(['Home', 'errands']);
    expect(task.priority).toBe('medium');
    expect(task.dueDate).toBeNull();
    expect(task.status).toBe('active');
    expect(task.completedAt).toBeNull();
    expect(task.createdAt).toBe('2026-10-23T12:00:00.000Z');
    expect(task.updatedAt).toBe(task.createdAt);
    expect(task.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('rejects an empty title, a bad due date, and too many tags', () => {
    expect(() => createTask({ title: '   ' }, now)).toThrow(TaskValidationError);
    expect(() => createTask({ title: 'Pay rent', dueDate: '2026-02-31' }, now)).toThrow(/calendar date/);
    expect(() =>
      createTask(
        { title: 'Tags', tags: Array.from({ length: 13 }, (_, index) => `tag-${index}`) },
        now,
      ),
    ).toThrow(/at most 12/);
  });

  it('parses a comma-separated tag field', () => {
    expect(parseTagsInput(' home, errands, home ')).toEqual(['home', 'errands']);
  });
});

describe('edits and completion', () => {
  it('patches fields without changing identity or completion', () => {
    const original = sampleTask({ notes: 'keep', tags: ['a'], completedAt: null });
    const later = new Date('2026-10-24T08:30:00.000Z');
    const updated = applyPatch(
      original,
      { title: 'Buy oat milk', priority: 'high', dueDate: '2026-10-25', tags: ['groceries'] },
      later,
    );

    expect(updated).toMatchObject({
      id: original.id,
      title: 'Buy oat milk',
      notes: 'keep',
      status: 'active',
      priority: 'high',
      dueDate: '2026-10-25',
      tags: ['groceries'],
      createdAt: original.createdAt,
      completedAt: null,
      updatedAt: '2026-10-24T08:30:00.000Z',
    });
  });

  it('clears a due date and refuses a blank title', () => {
    const original = sampleTask({ dueDate: '2026-10-25' });
    expect(applyPatch(original, { dueDate: null }, now).dueDate).toBeNull();
    expect(() => applyPatch(original, { title: ' ' }, now)).toThrow(TaskValidationError);
  });

  it('completes, reopens, and ignores a repeated status', () => {
    const task = sampleTask();
    const done = setCompleted(task, true, now);
    expect(done.status).toBe('completed');
    expect(done.completedAt).toBe('2026-10-23T12:00:00.000Z');
    expect(setCompleted(done, true, now)).toBe(done);

    const reopened = setCompleted(done, false, new Date('2026-10-24T00:00:00.000Z'));
    expect(reopened.status).toBe('active');
    expect(reopened.completedAt).toBeNull();
    expect(setCompleted(task, false, now)).toBe(task);
  });
});

describe('filters and ordering', () => {
  const tasks = [
    sampleTask({
      id: 'late',
      title: 'Late',
      dueDate: '2026-10-30',
      priority: 'high',
      updatedAt: '2026-10-23T12:00:00.000Z',
    }),
    sampleTask({
      id: 'soon-low',
      title: 'Soon low',
      dueDate: '2026-10-24',
      priority: 'low',
      updatedAt: '2026-10-23T12:00:00.000Z',
    }),
    sampleTask({
      id: 'soon-high',
      title: 'Soon high',
      dueDate: '2026-10-24',
      priority: 'high',
      updatedAt: '2026-10-23T11:00:00.000Z',
    }),
    sampleTask({
      id: 'newer-medium',
      title: 'Newer medium',
      dueDate: '2026-10-24',
      priority: 'medium',
      updatedAt: '2026-10-23T15:00:00.000Z',
    }),
    sampleTask({
      id: 'older-medium',
      title: 'Older medium',
      dueDate: '2026-10-24',
      priority: 'medium',
      updatedAt: '2026-10-23T10:00:00.000Z',
    }),
    sampleTask({ id: 'undated', title: 'No date', priority: 'high' }),
    sampleTask({
      id: 'done',
      title: 'Done',
      status: 'completed',
      completedAt: '2026-10-22T12:00:00.000Z',
      dueDate: '2026-10-01',
      priority: 'high',
    }),
  ];

  it('sorts active before completed, then due date, priority, and recent edits', () => {
    expect(queryTasks(tasks).map((task) => task.id)).toEqual([
      'soon-high',
      'newer-medium',
      'older-medium',
      'soon-low',
      'late',
      'undated',
      'done',
    ]);
  });

  it('filters by status and priority together', () => {
    expect(queryTasks(tasks, { status: 'active', priority: 'high' }).map((task) => task.id)).toEqual([
      'soon-high',
      'late',
      'undated',
    ]);
    expect(queryTasks(tasks, { status: 'completed' }).map((task) => task.id)).toEqual(['done']);
  });

  it('counts statuses', () => {
    expect(countByStatus(tasks)).toEqual({ all: 7, active: 6, completed: 1 });
  });
});

describe('due dates', () => {
  const today = '2026-10-23';

  it('uses the local calendar date', () => {
    expect(localIsoDate(new Date(2026, 9, 23, 23, 30))).toBe('2026-10-23');
  });

  it('marks only active tasks before today as overdue', () => {
    const overdue = sampleTask({ dueDate: '2026-10-22' });
    const dueToday = sampleTask({ dueDate: today });
    const done = sampleTask({
      dueDate: '2026-10-22',
      status: 'completed',
      completedAt: '2026-10-22T12:00:00.000Z',
    });

    expect(isOverdue(overdue, today)).toBe(true);
    expect(isOverdue(dueToday, today)).toBe(false);
    expect(isOverdue(done, today)).toBe(false);
    expect(dueLabel(overdue, today)).toMatch(/Overdue/);
    expect(dueLabel(dueToday, today)).toBe('Due today');
    expect(dueLabel(done, today)).toMatch(/Was due/);
    expect(formatDueDate('2026-10-23')).toContain('2026');
    expect(formatDueDate('2026-10-23')).toContain('23');
  });
});
