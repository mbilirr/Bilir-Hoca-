// Deneme sihirbazı › 4. adım: kontrol ve kayıt (Aşama 363: ayrı parça, yalnız gerekince yüklenir)
import { CheckCircle2 } from 'lucide-react';
import { Panel } from '../../ui/kit';
import { InfoTip } from '../../ui/Compact';
import { puanNotu, fmtNet, fmtScore, tamOturum } from '../../../lib/deneme/lgs';
import { useSihirbazBaglam } from './useSihirbaz';

export function Adim4Kayit() {
  const { existing, grade, lgs, scoring, step, counts, computed } = useSihirbazBaglam();
  return (
    <>
      {step === 4 && computed && (
        <Panel title="Kontrol ve kayıt" icon={CheckCircle2} tone="success">
          {(() => {
            const n = computed.list.length;
            // Aşama 289: puan ortalaması yalnız bütün oturumlara girenlerle
            const scores = computed.list.filter(tamOturum).map((r) => r.score ?? 0);
            const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
            const missingSozel = computed.list.filter((r) => r.stats.missing?.includes('sozel')).length;
            const missingSayisal = computed.list.filter((r) => r.stats.missing?.includes('sayisal')).length;
            return (
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-4">
                  <div className="rounded-xl border border-line px-3 py-2">
                    <p className="ui-eyebrow">Öğrenci</p>
                    <p className="text-xl font-bold text-fg tabular-nums">{n}</p>
                  </div>
                  <div className="rounded-xl border border-line px-3 py-2">
                    <p className="ui-eyebrow">Ortalama puan</p>
                    <p className="text-xl font-bold text-fg tabular-nums">{fmtScore(avg)}</p>
                  </div>
                  <div className="rounded-xl border border-line px-3 py-2">
                    <p className="ui-eyebrow">Değerlendirilen dersler</p>
                    <p className="text-sm font-semibold text-fg">{computed.active.map((s) => s.short).join(', ')}</p>
                  </div>
                  <div className="rounded-xl border border-line px-3 py-2">
                    <p className="ui-eyebrow">Atlanan satır</p>
                    <p className="text-xl font-bold text-fg tabular-nums">{counts.skip}</p>
                  </div>
                </div>
                {(missingSozel > 0 || missingSayisal > 0 || computed.guessed > 0) && (
                  <ul className="text-xs text-warning-fg bg-warning-soft rounded-xl px-3 py-2 space-y-0.5">
                    {missingSozel > 0 && <li>• {missingSozel} öğrencinin sözel oturumunda hiç cevap yok: sözel dersleri ortalamaya girmez, öğrenci sıralama dışı kalır.</li>}
                    {missingSayisal > 0 && <li>• {missingSayisal} öğrencinin sayısal oturumunda hiç cevap yok: sayısal dersleri ortalamaya girmez, öğrenci sıralama dışı kalır.</li>}
                    {computed.guessed > 0 && <li>• {computed.guessed} öğrencinin kitapçık türü boştu; cevaplarına göre tahmin edildi.</li>}
                  </ul>
                )}
                {existing && (
                  <p className="text-xs text-info-fg bg-info-soft rounded-xl px-3 py-2">
                    Bu denemede daha önce kaydedilmiş sonuçlar korunur; yeni yüklenen derslerin cevapları eklenir ve sıralamalar yeniden hesaplanır.
                  </p>
                )}
                <div className="bg-surface border border-line rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                    <table className="w-full text-left text-xs text-fg-2">
                      <thead className="bg-surface-2/60 uppercase tracking-wider text-muted border-b border-line sticky top-0">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Öğrenci</th>
                          <th className="px-3 py-2 font-semibold">Sınıf</th>
                          {computed.active.map((s) => (
                            <th key={s.key} className="px-3 py-2 font-semibold text-center">{s.short} net</th>
                          ))}
                          <th className="px-3 py-2 font-semibold text-right">Puan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {computed.list
                          .slice()
                          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                          .map((r) => (
                            <tr key={r.studentId}>
                              <td className="px-3 py-1.5 font-semibold text-fg">{r.studentName}</td>
                              <td className="px-3 py-1.5">{r.className || '—'}</td>
                              {computed.active.map((s) => (
                                <td key={s.key} className="px-3 py-1.5 text-center tabular-nums">{fmtNet(r.stats.subjects[s.key]?.net)}</td>
                              ))}
                              <td className="px-3 py-1.5 text-right font-bold text-fg tabular-nums">{fmtScore(r.score)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <p className="text-xs text-muted flex items-center gap-1">
                  {lgs ? 'Puan yaklaşık LGS puanıdır.' : 'Puan LGS yöntemiyle hesaplanır (tam net 500).'}
                  <InfoTip text={puanNotu({ grade, scoring })} />
                </p>
              </div>
            );
          })()}
        </Panel>
      )}
    </>
  );
}
export default Adim4Kayit;
