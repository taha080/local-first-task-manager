/**
 * Wires the page to IndexedDB. The list in memory is refreshed after every
 * write so filters and the form always show what was stored.
 */

import { registerServiceWorker } from './pwa/register';
import { renderTaskList } from './render';
import {
  createTaskRecord,
  deleteTaskRecord,
  listTasks,
  replaceAllTasks,
  setTaskCompleted,
  updateTaskRecord,
} from './db';
import {
  countByStatus,
  isPriority,
  isPriorityFilter,
  isStatusFilter,
  localIsoDate,
  parseTagsInput,
  queryTasks,
  TaskValidationError,
} from './task';
import { parseImport, serializeTasks } from './transfer';
import type { PriorityFilter, StatusFilter, Task, TaskInput } from './types';
import './styles.css';

const form = requireElement<HTMLFormElement>('#task-form');
const titleInput = requireElement<HTMLInputElement>('#title');
const notesInput = requireElement<HTMLTextAreaElement>('#notes');
const dueInput = requireElement<HTMLInputElement>('#due');
const priorityInput = requireElement<HTMLSelectElement>('#priority');
const tagsInput = requireElement<HTMLInputElement>('#tags');
const saveButton = requireElement<HTMLButtonElement>('#save-button');
const cancelButton = requireElement<HTMLButtonElement>('#cancel-edit');
const formError = requireElement<HTMLElement>('#form-error');
const composerTitle = requireElement<HTMLElement>('#composer-title');
const list = requireElement<HTMLElement>('#task-list');
const empty = requireElement<HTMLElement>('#empty-state');
const emptyTitle = requireElement<HTMLElement>('#empty-title');
const emptyCopy = requireElement<HTMLElement>('#empty-copy');
const banner = requireElement<HTMLElement>('#banner');
const openCount = requireElement<HTMLElement>('#open-count');
const countAll = requireElement<HTMLElement>('#count-all');
const countActive = requireElement<HTMLElement>('#count-active');
const countCompleted = requireElement<HTMLElement>('#count-completed');
const priorityFilter = requireElement<HTMLSelectElement>('#priority-filter');
const connection = requireElement<HTMLElement>('#connection-status');
const exportButton = requireElement<HTMLButtonElement>('#export-button');
const importButton = requireElement<HTMLButtonElement>('#import-button');
const importFile = requireElement<HTMLInputElement>('#import-file');
const statusButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-status]')];
const statusGroup = requireElement<HTMLElement>('[role="radiogroup"]');

let tasks: Task[] = [];
let statusFilter: StatusFilter = 'all';
let priority: PriorityFilter = 'all';
let editingId: string | null = null;
let saving = false;

const handlers = {
  onToggle: (id: string, completed: boolean) => {
    void toggleTask(id, completed);
  },
  onEdit: (id: string) => {
    const task = tasks.find((item) => item.id === id);
    if (task) fillForm(task);
  },
  onDelete: (id: string) => {
    void removeTask(id);
  },
};

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void saveForm();
});

cancelButton.addEventListener('click', () => {
  clearForm();
  titleInput.focus();
});

statusGroup.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
  event.preventDefault();
  const current = statusButtons.findIndex((button) => button.getAttribute('aria-checked') === 'true');
  const delta = event.key === 'ArrowRight' ? 1 : -1;
  const next = statusButtons[(current + delta + statusButtons.length) % statusButtons.length];
  next?.focus();
  next?.click();
});

for (const button of statusButtons) {
  button.addEventListener('click', () => {
    const value = button.dataset.status ?? '';
    if (!isStatusFilter(value)) return;
    selectStatus(value);
  });
}

priorityFilter.addEventListener('change', () => {
  if (!isPriorityFilter(priorityFilter.value)) return;
  priority = priorityFilter.value;
  paint();
});

exportButton.addEventListener('click', () => {
  void exportCurrentTasks();
});

importButton.addEventListener('click', () => {
  importFile.click();
});

importFile.addEventListener('change', () => {
  const file = importFile.files?.[0];
  importFile.value = '';
  if (file) void importFromFile(file);
});

window.addEventListener('online', renderConnection);
window.addEventListener('offline', renderConnection);

void start();

async function start(): Promise<void> {
  renderConnection();
  try {
    await refresh();
  } catch (error) {
    announce(error instanceof Error ? error.message : 'Could not open the task database.');
  }
  try {
    await registerServiceWorker();
  } catch (error) {
    console.error('Service worker registration failed.', error);
  }
}

async function refresh(): Promise<void> {
  tasks = await listTasks();
  paint();
}

function paint(): void {
  const inPriority = tasks.filter((task) => priority === 'all' || task.priority === priority);
  const counts = countByStatus(inPriority);
  const visible = queryTasks(inPriority, { status: statusFilter });

  countAll.textContent = String(counts.all);
  countActive.textContent = String(counts.active);
  countCompleted.textContent = String(counts.completed);
  openCount.textContent = counts.active === 1 ? '1 open' : `${counts.active} open`;

  renderTaskList(list, visible, localIsoDate(), handlers);
  const isEmpty = visible.length === 0;
  list.hidden = isEmpty;
  empty.hidden = !isEmpty;
  if (tasks.length === 0) {
    emptyTitle.textContent = 'Nothing on the list yet';
    emptyCopy.textContent = 'Add a task above. It stays in this browser, even when you are offline.';
  } else if (isEmpty) {
    emptyTitle.textContent = 'No tasks in this view';
    emptyCopy.textContent = 'Try another status or priority filter.';
  }
}

async function saveForm(): Promise<void> {
  if (saving) return;
  saving = true;
  saveButton.disabled = true;
  clearFormError();
  try {
    const input = readForm();
    if (editingId) {
      await updateTaskRecord(editingId, input);
      announce('Task updated.');
    } else {
      await createTaskRecord(input);
      announce('Task added.');
    }
    clearForm();
    await refresh();
    titleInput.focus();
  } catch (error) {
    showFormError(error);
  } finally {
    saving = false;
    saveButton.disabled = false;
  }
}

function readForm(): TaskInput {
  if (!isPriority(priorityInput.value)) {
    throw new TaskValidationError('Priority must be low, medium, or high.');
  }
  return {
    title: titleInput.value,
    notes: notesInput.value,
    dueDate: dueInput.value,
    priority: priorityInput.value,
    tags: parseTagsInput(tagsInput.value),
  };
}

function fillForm(task: Task): void {
  editingId = task.id;
  titleInput.value = task.title;
  notesInput.value = task.notes;
  dueInput.value = task.dueDate ?? '';
  priorityInput.value = task.priority;
  tagsInput.value = task.tags.join(', ');
  composerTitle.textContent = 'Edit task';
  saveButton.textContent = 'Save changes';
  cancelButton.hidden = false;
  clearFormError();
  titleInput.focus();
  form.scrollIntoView({ block: 'nearest' });
}

function clearForm(): void {
  editingId = null;
  form.reset();
  priorityInput.value = 'medium';
  composerTitle.textContent = 'Add a task';
  saveButton.textContent = 'Add task';
  cancelButton.hidden = true;
  clearFormError();
}

async function toggleTask(id: string, completed: boolean): Promise<void> {
  try {
    await setTaskCompleted(id, completed);
    announce(completed ? 'Task completed.' : 'Task reopened.');
    await refresh();
  } catch (error) {
    announce(error instanceof Error ? error.message : 'Could not update the task.');
    await refresh();
  }
}

async function removeTask(id: string): Promise<void> {
  const task = tasks.find((item) => item.id === id);
  const title = task?.title ?? 'this task';
  if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
  try {
    await deleteTaskRecord(id);
    if (editingId === id) clearForm();
    announce('Task deleted.');
    await refresh();
  } catch (error) {
    announce(error instanceof Error ? error.message : 'Could not delete the task.');
  }
}

async function exportCurrentTasks(): Promise<void> {
  try {
    const current = await listTasks();
    const json = serializeTasks(current);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tasks-${localIsoDate()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    const noun = current.length === 1 ? 'task' : 'tasks';
    announce(`Exported ${current.length} ${noun}.`);
  } catch (error) {
    announce(error instanceof Error ? error.message : 'Could not export tasks.');
  }
}

async function importFromFile(file: File): Promise<void> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    announce('Could not read that file.');
    return;
  }

  const result = parseImport(text);
  if (!result.ok) {
    const preview = result.errors.slice(0, 6);
    const extra = result.errors.length - preview.length;
    const suffix = extra > 0 ? ` ${extra} more ${extra === 1 ? 'issue' : 'issues'}.` : '';
    announce(`Import blocked. ${preview.join(' ')}${suffix}`);
    return;
  }

  const noun = result.tasks.length === 1 ? 'task' : 'tasks';
  const confirmed = window.confirm(
    `Replace every task on this device with ${result.tasks.length} ${noun} from the file?`,
  );
  if (!confirmed) return;

  try {
    await replaceAllTasks(result.tasks);
    if (editingId) clearForm();
    announce(`Imported ${result.tasks.length} ${noun}.`);
    await refresh();
  } catch (error) {
    announce(error instanceof Error ? error.message : 'Import failed.');
  }
}

function selectStatus(next: StatusFilter): void {
  statusFilter = next;
  for (const button of statusButtons) {
    const selected = button.dataset.status === next;
    button.setAttribute('aria-checked', selected ? 'true' : 'false');
    button.tabIndex = selected ? 0 : -1;
  }
  paint();
}

function renderConnection(): void {
  const online = navigator.onLine;
  connection.textContent = online ? 'Online' : 'Offline';
  connection.dataset.state = online ? 'online' : 'offline';
}

function announce(message: string): void {
  banner.textContent = message;
}

function showFormError(error: unknown): void {
  const message =
    error instanceof TaskValidationError
      ? error.issues.join(' ')
      : error instanceof Error
        ? error.message
        : 'Could not save the task.';
  formError.textContent = message;
  formError.hidden = false;
}

function clearFormError(): void {
  formError.textContent = '';
  formError.hidden = true;
}

function requireElement<T extends Element>(selector: string): T {
  const node = document.querySelector(selector);
  if (!node) throw new Error(`Missing element: ${selector}`);
  return node as T;
}
