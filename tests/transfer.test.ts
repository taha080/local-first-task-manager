import { describe, expect, it } from 'vitest';
import { createTask, setCompleted } from '../src/task';
import { EXPORT_APP, EXPORT_VERSION, parseImport, serializeTasks } from '../src/transfer';
import { LIMITS, type Task } from '../src/types';
import { sampleTask } from './fixtures';

const now = new Date('2026-10-23T12:00:00.000Z');

function file(tasks: Task[], extras: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: EXPORT_VERSION,
    app: EXPORT_APP,
    exportedAt: now.toISOString(),
    tasks,
    ...extras,
  });
}

describe('export and import', () => {
  it('round-trips tasks created by the app, including a completed one', () => {
    const active = createTask(
      { title: 'Write README', notes: 'Keep it short', priority: 'high', dueDate: '2026-10-30', tags: ['docs'] },
      now,
    );
    const done = setCompleted(createTask({ title: 'Ship it' }, now), true, new Date('2026-10-23T18:00:00.000Z'));
    const raw = serializeTasks([active, done], now);
    const parsed = parseImport(raw);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.exportedAt).toBe(now.toISOString());
    expect(parsed.tasks).toEqual([active, done]);
    expect(raw.endsWith('\n')).toBe(true);
  });

  it('accepts an empty list and ignores unknown fields', () => {
    const task = { ...sampleTask(), extra: true };
    const parsed = parseImport(file([task as Task], { note: 'hello' }));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.tasks).toEqual([sampleTask()]);
    expect(parsed.tasks[0]).not.toHaveProperty('extra');
  });

  it('normalizes a title and drops duplicate tags on import', () => {
    const parsed = parseImport(file([sampleTask({ title: '  Buy   milk  ', tags: ['Home', 'home'] })]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.tasks[0]?.title).toBe('Buy milk');
    expect(parsed.tasks[0]?.tags).toEqual(['Home']);
  });

  it('rejects malformed files and collects task errors', () => {
    expect(errorText('not json')).toMatch(/not valid JSON/);
    expect(errorText('[]')).toMatch(/JSON object/);
    expect(errorText('{"version":1}')).toMatch(/tasks/);
    expect(errorText(JSON.stringify({ ...JSON.parse(file([])), version: 2 }))).toMatch(/version/);
    expect(errorText(file([]).replace(EXPORT_APP, 'other-app'))).toMatch(/app id/);
    expect(errorText(' '.repeat(LIMITS.importChars + 1))).toMatch(/characters or fewer/);
    expect(
      errorText(
        JSON.stringify({
          version: EXPORT_VERSION,
          app: EXPORT_APP,
          exportedAt: now.toISOString(),
          tasks: Array.from({ length: LIMITS.importTasks + 1 }, () => ({})),
        }),
      ),
    ).toMatch(/at most 5000/);
  });

  it('rejects invalid tasks, duplicate ids, and inconsistent completion', () => {
    const cases: Array<[Task, RegExp]> = [
      [sampleTask({ title: '   ' }), /Title is required/],
      [sampleTask({ dueDate: '2026-02-31' }), /Due date/],
      [sampleTask({ priority: 'urgent' as Task['priority'] }), /Priority/],
      [sampleTask({ status: 'archived' as Task['status'] }), /Status/],
      [sampleTask({ status: 'active', completedAt: now.toISOString() }), /completedAt/],
      [sampleTask({ status: 'completed', completedAt: null }), /completedAt/],
      [sampleTask({ id: 'has spaces' }), /Id must/],
      [sampleTask({ notes: 12 as unknown as string }), /Notes/],
      [sampleTask({ tags: 'home' as unknown as string[] }), /Tags/],
    ];

    for (const [task, pattern] of cases) {
      expect(errorText(file([task]))).toMatch(pattern);
    }

    expect(errorText(file([sampleTask({ id: 'same' }), sampleTask({ id: 'same', title: 'Other' })]))).toMatch(
      /duplicate id/,
    );
  });
});

function errorText(raw: string): string {
  const result = parseImport(raw);
  expect(result.ok).toBe(false);
  if (result.ok) return '';
  return result.errors.join(' ');
}
