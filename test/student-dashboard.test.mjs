import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../client/66-student-dashboard.js', import.meta.url), 'utf8');
const tasks = vm.runInNewContext(source + '\ndashboardTasks');

test('dashboard orders open tasks and exams without treating an unknown date as open', () => {
  const now = Date.parse('2026-11-13T12:00+06:00');
  const result = tasks([
    { stage: 'paid', item: { id: 'paid', end: '2026-11-25', admit: '2026-11-14', exam: '2026-11-20' } },
    { stage: 'shortlist', item: { id: 'open', start: '2026-11-10', end: '2026-11-16', exam: '2026-11-23' } },
    { stage: 'shortlist', item: { id: 'future', start: '2026-11-15', end: '2026-11-18' } },
    { stage: 'shortlist', item: { id: 'unknown', end: '2026-11-29' } },
    { stage: 'exam', item: { id: 'done', exam: '2026-11-19' } },
  ], now);
  assert.deepEqual(Array.from(result.actions, event => event.item.id), ['open']);
  assert.deepEqual(Array.from(result.exams, event => event.item.id), ['paid', 'open']);
  assert.equal(result.closing, 2);
  assert.ok(result.upcoming.some(event => event.item.id === 'paid' && event.key === 'admit'));
});
