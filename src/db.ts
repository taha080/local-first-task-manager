/**
 * IndexedDB storage for tasks.
 *
 * The database lives in this browser profile. Nothing in this module sends
 * data over the network. Transactions auto-commit when the call stack goes
 * idle, so a read that is followed by a write (update, complete, delete)
 * schedules the write from the request's success handler instead of awaiting.
 */

import { applyPatch, createTask, setCompleted, TaskValidationError } from './task';
import { parseImport, serializeTasks } from './transfer';
import type { Task, TaskInput, TaskPatch, TaskStatus } from './types';

export const DB_NAME = 'local-first-task-manager';
export const DB_VERSION = 1;
const STORE = 'tasks';
const STATUS_INDEX = 'by-status';

let databasePromise: Promise<IDBDatabase> | null = null;

export function openDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = createDatabase().catch((error: unknown) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

/** Drop the cached connection. Tests use this before deleting the database. */
export async function closeDatabase(): Promise<void> {
  if (!databasePromise) return;
  const pending = databasePromise;
  databasePromise = null;
  try {
    const db = await pending;
    db.close();
  } catch {
    // Opening failed; there is no connection to close.
  }
}

export async function listTasks(): Promise<Task[]> {
  const db = await openDatabase();
  return requestToPromise(db.transaction(STORE, 'readonly').objectStore(STORE).getAll() as IDBRequest<Task[]>);
}

/** Uses the `by-status` index. Sorting stays in `queryTasks`. */
export async function listTasksByStatus(status: TaskStatus): Promise<Task[]> {
  const db = await openDatabase();
  const index = db.transaction(STORE, 'readonly').objectStore(STORE).index(STATUS_INDEX);
  return requestToPromise(index.getAll(status) as IDBRequest<Task[]>);
}

export async function createTaskRecord(input: TaskInput, now = new Date()): Promise<Task> {
  const task = createTask(input, now);
  const db = await openDatabase();
  await requestToPromise(db.transaction(STORE, 'readwrite').objectStore(STORE).put(task));
  return task;
}

export async function updateTaskRecord(id: string, patch: TaskPatch, now = new Date()): Promise<Task> {
  const db = await openDatabase();
  return mutateTask(db, id, (current) => applyPatch(current, patch, now));
}

export async function setTaskCompleted(id: string, completed: boolean, now = new Date()): Promise<Task> {
  const db = await openDatabase();
  return mutateTask(db, id, (current) => setCompleted(current, completed, now));
}

export async function deleteTaskRecord(id: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    const getRequest = store.get(id);
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error('Could not delete the task.'));
    };

    getRequest.onerror = () => fail(getRequest.error);
    getRequest.onsuccess = () => {
      if (!getRequest.result) {
        fail(new Error('That task no longer exists.'));
        return;
      }
      // delete() stays inside this success handler so the transaction is still open.
      const deleteRequest = store.delete(id);
      deleteRequest.onerror = () => fail(deleteRequest.error);
      deleteRequest.onsuccess = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
    };
  });
}

/**
 * Replace every stored task. The write is one transaction: clear, then put.
 * Tasks are passed through the import validator first so the database and the
 * backup file share a single schema. A rejected file leaves the old rows in place.
 */
export async function replaceAllTasks(tasks: readonly Task[], now = new Date()): Promise<void> {
  const parsed = parseImport(serializeTasks(tasks, now));
  if (!parsed.ok) throw new TaskValidationError(parsed.errors);
  const normalized = parsed.tasks;

  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error('Could not replace tasks.'));
    };

    const clearRequest = store.clear();
    clearRequest.onerror = () => fail(clearRequest.error);
    clearRequest.onsuccess = () => {
      // These puts are requested inside the clear handler, while the
      // transaction is still open. They commit or roll back together.
      for (const task of normalized) store.put(task);
    };
    tx.oncomplete = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    tx.onerror = () => fail(tx.error);
    tx.onabort = () => fail(tx.error ?? new Error('The import was aborted.'));
  });
}

function createDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex(STATUS_INDEX, 'status', { unique: false });
      }
    };
    request.onerror = () => reject(request.error ?? new Error('Could not open the task database.'));
    request.onsuccess = () => {
      const db = request.result;
      // Closing on versionchange lets tests (and future migrations) delete
      // or upgrade the database instead of hanging on a blocked connection.
      db.onversionchange = () => {
        db.close();
        databasePromise = null;
      };
      resolve(db);
    };
  });
}

function mutateTask(db: IDBDatabase, id: string, change: (current: Task) => Task): Promise<Task> {
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    const getRequest = store.get(id);
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error('Could not update the task.'));
    };

    getRequest.onerror = () => fail(getRequest.error);
    getRequest.onsuccess = () => {
      const current = getRequest.result as Task | undefined;
      if (!current) {
        fail(new Error('That task no longer exists.'));
        return;
      }

      let next: Task;
      try {
        next = change(current);
      } catch (error) {
        fail(error);
        return;
      }

      if (next === current) {
        if (settled) return;
        settled = true;
        resolve(current);
        return;
      }

      const putRequest = store.put(next);
      putRequest.onerror = () => fail(putRequest.error);
      putRequest.onsuccess = () => {
        if (settled) return;
        settled = true;
        resolve(next);
      };
    };
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}
