import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeDatabase,
  createTaskRecord,
  DB_NAME,
  deleteTaskRecord,
  listTasks,
  listTasksByStatus,
  replaceAllTasks,
  setTaskCompleted,
  updateTaskRecord,
} from '../src/db';
import { createTask, setCompleted, TaskValidationError } from '../src/task';

const now = new Date('2026-10-23T12:00:00.000Z');

beforeEach(async () => {
  await resetDatabase();
});

afterEach(async () => {
  await closeDatabase();
});

describe('IndexedDB task store', () => {
  it('creates, updates, completes, filters, and deletes tasks', async () => {
    const first = await createTaskRecord(
      {
        title: ' Write spec ',
        priority: 'high',
        tags: ['work', 'work'],
        dueDate: '2026-10-24',
        notes: ' draft ',
      },
      now,
    );
    expect(first.title).toBe('Write spec');
    expect(first.tags).toEqual(['work']);
    expect(first.notes).toBe('draft');

    const second = await createTaskRecord({ title: 'Stretch' }, now);
    expect(await listTasks()).toHaveLength(2);

    const updated = await updateTaskRecord(
      first.id,
      { title: 'Write README', priority: 'low' },
      new Date('2026-10-23T13:00:00.000Z'),
    );
    expect(updated).toMatchObject({
      id: first.id,
      title: 'Write README',
      priority: 'low',
      createdAt: first.createdAt,
      status: 'active',
      updatedAt: '2026-10-23T13:00:00.000Z',
    });

    const done = await setTaskCompleted(second.id, true, new Date('2026-10-23T14:00:00.000Z'));
    expect(done.status).toBe('completed');
    expect(done.completedAt).toBe('2026-10-23T14:00:00.000Z');

    const reopened = await setTaskCompleted(second.id, false, new Date('2026-10-23T15:00:00.000Z'));
    expect(reopened.status).toBe('active');
    expect(reopened.completedAt).toBeNull();
    await setTaskCompleted(second.id, true, new Date('2026-10-23T16:00:00.000Z'));

    expect((await listTasksByStatus('active')).map((task) => task.id)).toEqual([first.id]);
    expect((await listTasksByStatus('completed')).map((task) => task.id)).toEqual([second.id]);

    await deleteTaskRecord(first.id);
    expect(await listTasks()).toHaveLength(1);
    await expect(deleteTaskRecord(first.id)).rejects.toThrow(/no longer exists/);
    await expect(updateTaskRecord(first.id, { title: 'Nope' })).rejects.toThrow(/no longer exists/);
  });

  it('does not store a rejected edit', async () => {
    const task = await createTaskRecord({ title: 'Stay' }, now);
    await expect(updateTaskRecord(task.id, { title: '   ' })).rejects.toBeInstanceOf(TaskValidationError);
    const stored = await listTasks();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.title).toBe('Stay');
  });

  it('replaces every row from a valid backup and keeps old rows when validation fails', async () => {
    await createTaskRecord({ title: 'Keep me' }, now);
    const imported = [
      createTask({ title: 'A', tags: ['home'] }, now),
      setCompleted(createTask({ title: 'B' }, now), true, new Date('2026-10-23T18:00:00.000Z')),
    ];

    await replaceAllTasks(imported, now);
    const stored = await listTasks();
    expect(stored.map((task) => task.title).sort()).toEqual(['A', 'B']);

    const [firstImported] = imported;
    if (!firstImported) throw new Error('Expected a task to import.');
    await expect(replaceAllTasks([{ ...firstImported, title: '   ' }])).rejects.toBeInstanceOf(
      TaskValidationError,
    );
    const after = await listTasks();
    expect(after.map((task) => task.title).sort()).toEqual(['A', 'B']);
  });
});

async function resetDatabase(): Promise<void> {
  await closeDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Could not delete the test database.'));
    request.onblocked = () => resolve();
  });
}
