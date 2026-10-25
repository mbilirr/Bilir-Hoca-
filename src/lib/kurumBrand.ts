// ============================================================================
// KURUM KİMLİĞİ (Aşama 82): kurumun adı ve logosu.
// Uygulama kurum bilgisini yükleyince buraya yazar; karne PDF'leri ve üst menü buradan okur.
// (Bağımsız küçük bir modül: PDF kodu veri katmanını içe aktarmadan kullanabilir.)
// ============================================================================
export interface KurumBrand {
  name: string;
  /** data:image/png;base64,... ya da data:image/jpeg;base64,... (boş = logo yok) */
  logo: string;
}

let current: KurumBrand = { name: '', logo: '' };

export function setKurumBrand(next: Partial<KurumBrand> | null): void {
  current = { name: String(next?.name || ''), logo: String(next?.logo || '') };
}

export function getKurumBrand(): KurumBrand {
  return current;
}
