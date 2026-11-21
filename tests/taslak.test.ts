// Aşama 346: form taslakları (344): hesaba göre ayrı, 24 saat ömür, elle çıkışta silinir
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

class Depo {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return Array.from(this.m.keys())[i] ?? null;
  }
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}
const depo = new Depo();
(globalThis as any).window = { sessionStorage: depo };

const { taslakAnahtari, taslakOku, taslakYaz, taslakSil, taslaklariSil } = await import('../src/lib/taslak');

beforeEach(() => depo.clear());

test('yazılan taslak aynı hesapla okunur, başka hesap göremez', () => {
  taslakYaz(taslakAnahtari('u1', 'odev_yeni'), { baslik: 'Kesirler' });
  assert.deepEqual(taslakOku<any>(taslakAnahtari('u1', 'odev_yeni'))?.deger, { baslik: 'Kesirler' });
  assert.equal(taslakOku(taslakAnahtari('u2', 'odev_yeni')), null);
});

test('24 saatten eski taslak okunmaz ve silinir', () => {
  const a = taslakAnahtari('u1', 'etut_yeni') as string;
  depo.setItem(a, JSON.stringify({ deger: { x: 1 }, zaman: Date.now() - 25 * 3600 * 1000 }));
  assert.equal(taslakOku(a), null);
  assert.equal(depo.getItem(a), null);
});

test('taslakSil ve elle çıkış (taslaklariSil) yalnız taslakları siler', () => {
  const a = taslakAnahtari('u1', 'duyuru_ogrenci');
  taslakYaz(a, 'x');
  taslakSil(a);
  assert.equal(taslakOku(a), null);
  taslakYaz(taslakAnahtari('u1', 'a'), 1);
  taslakYaz(taslakAnahtari('u2', 'b'), 2);
  depo.setItem('edu_sys_baska', 'kalmalı');
  taslaklariSil();
  assert.equal(depo.length, 1);
  assert.equal(depo.getItem('edu_sys_baska'), 'kalmalı');
});

test('hesap ya da form adı yoksa taslak tutulmaz', () => {
  assert.equal(taslakAnahtari(null, 'odev_yeni'), null);
  assert.equal(taslakAnahtari('u1', null), null);
});
