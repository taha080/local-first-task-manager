import type { Task } from '../src/types';

export function sampleTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Buy milk',
    notes: '',
    status: 'active',
    priority: 'medium',
    dueDate: null,
    tags: [],
    createdAt: '2026-10-23T12:00:00.000Z',
    updatedAt: '2026-10-23T12:00:00.000Z',
    completedAt: null,
    ...overrides,
  };
}
