// Aşama 346: yoklamada yalnız değişen öğrenciler gönderilir (343)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yoklamaFarki } from '../src/services/listeBirlestirme';

const k = (studentId: string, status: string, note = '') => ({ studentId, studentName: studentId, status, note }) as any;

test('değişmeyen öğrenci gönderilmez, değişen ve yeni eklenen gönderilir', () => {
  const r = yoklamaFarki([k('a', 'present'), k('b', 'present')], [k('a', 'present'), k('b', 'absent'), k('c', 'late')]);
  assert.deepEqual(r.degisen.map((x) => x.studentId), ['b', 'c']);
  assert.deepEqual(r.silinen, []);
});

test('not değişikliği de değişiklik sayılır; çıkarılan öğrenci silinenlerde', () => {
  const r = yoklamaFarki([k('a', 'present'), k('b', 'present')], [k('a', 'present', 'raporlu')]);
  assert.deepEqual(r.degisen.map((x) => x.studentId), ['a']);
  assert.deepEqual(r.silinen, ['b']);
});

test('aynı yoklama: hiçbir şey gönderilmez', () => {
  const r = yoklamaFarki([k('a', 'present')], [k('a', 'present')]);
  assert.equal(r.degisen.length, 0);
  assert.equal(r.silinen.length, 0);
});
