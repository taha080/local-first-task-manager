/**
 * Builds task rows with DOM APIs. User text is assigned with `textContent`
 * so a title cannot inject markup.
 */

import { dueLabel, isOverdue } from './task';
import type { Task } from './types';

export interface TaskListHandlers {
  onToggle: (id: string, completed: boolean) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function renderTaskList(
  list: HTMLElement,
  tasks: readonly Task[],
  today: string,
  handlers: TaskListHandlers,
): void {
  const fragment = document.createDocumentFragment();
  for (const task of tasks) fragment.append(renderTask(task, today, handlers));
  list.replaceChildren(fragment);
}

function renderTask(task: Task, today: string, handlers: TaskListHandlers): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'task';
  item.dataset.status = task.status;
  item.dataset.priority = task.priority;

  const label = document.createElement('label');
  label.className = 'toggle';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = task.status === 'completed';
  checkbox.ariaLabel = task.status === 'completed' ? `Reopen "${task.title}"` : `Complete "${task.title}"`;
  checkbox.addEventListener('change', () => {
    handlers.onToggle(task.id, checkbox.checked);
  });

  const box = document.createElement('span');
  box.className = 'check';
  box.ariaHidden = 'true';
  label.append(checkbox, box);

  const body = document.createElement('div');
  const line = document.createElement('div');
  line.className = 'task-line';

  const title = document.createElement('h3');
  title.className = 'task-title';
  title.textContent = task.title;

  const priority = document.createElement('span');
  priority.className = 'priority-pill';
  priority.dataset.priority = task.priority;
  priority.textContent = capitalize(task.priority);
  line.append(title, priority);
  body.append(line);

  if (task.notes) {
    const notes = document.createElement('p');
    notes.className = 'notes';
    notes.textContent = task.notes;
    body.append(notes);
  }

  const meta = document.createElement('div');
  meta.className = 'meta';
  const labelText = dueLabel(task, today);
  if (labelText && task.dueDate) {
    const time = document.createElement('time');
    time.dateTime = task.dueDate;
    time.className = isOverdue(task, today) ? 'due overdue' : 'due';
    time.textContent = labelText;
    meta.append(time);
  }

  if (task.tags.length > 0) {
    const tags = document.createElement('ul');
    tags.className = 'tags';
    for (const tag of task.tags) {
      const tagItem = document.createElement('li');
      tagItem.textContent = tag;
      tags.append(tagItem);
    }
    meta.append(tags);
  }

  if (meta.childNodes.length > 0) body.append(meta);

  const actions = document.createElement('div');
  actions.className = 'task-actions';
  actions.append(
    actionButton('Edit', `Edit "${task.title}"`, 'text-button', () => handlers.onEdit(task.id)),
    actionButton('Delete', `Delete "${task.title}"`, 'text-button delete-button', () => handlers.onDelete(task.id)),
  );

  item.append(label, body, actions);
  return item;
}

function actionButton(text: string, ariaLabel: string, className: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  button.ariaLabel = ariaLabel;
  button.addEventListener('click', onClick);
  return button;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
