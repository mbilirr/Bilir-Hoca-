import React, { useRef, useState } from 'react';
import { ArrowLeftRight, FileText } from 'lucide-react';
import { Modal, cx } from '../ui/kit';
import type { ExamQuestions, ExamSubject } from '../../lib/deneme/lgs';
import { extractPdfItems } from '../../lib/deneme/kitapcik';
import { applyMatch, bookletQuestions, matchSubject, type SubjectMatch } from '../../lib/deneme/kitapcikEslestir';
import { bookletKey } from '../../lib/deneme/anahtarCikti';

// ============================================================================
// Aşama 93: A / B kitapçık PDF'lerinden soru eşleştirme penceresi.
// Kitapçıklar yalnızca tarayıcıda okunur; hiçbir yere yüklenmez, yapay zekâ kullanılmaz.
// "Uygula" eşleşmeyi anahtara yazar; kayıtlı denemede "Kaydet ve yeniden hesapla" ile sonuçlar da düzelir.
// ============================================================================

const BTN = 'ui-btn ui-btn-sm w-28 justify-center';
type Side = 'A' | 'B';

export const KitapcikEslestirModal: React.FC<{
  open: boolean;
  onClose: () => void;
  subjects: ExamSubject[];
  questions: ExamQuestions;
  onApply: (qs: ExamQuestions, summary: string) => void;
}> = ({ open, onClose, subjects, questions, onApply }) => {
  const refs = { A: useRef<HTMLInputElement | null>(null), B: useRef<HTMLInputElement | null>(null) };
  const [files, setFiles] = useState<Record<Side, File[]>>({ A: [], B: [] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<SubjectMatch[] | null>(null);

  const keyed = subjects.filter((s) => (questions[s.key] || []).some((q) => q.answer));

  const run = async () => {
    setBusy(true);
    setErr(null);
    setRes(null);
    try {
      const read = (fs: File[]) => Promise.all(fs.map((f) => extractPdfItems(f, 80)));
      const [pa, pb] = await Promise.all([read(files.A), read(files.B)]);
      const A = bookletQuestions(pa, keyed);
      const B = bookletQuestions(pb, keyed);
      if (A.textless || B.textless) throw new Error(`${A.textless ? 'A' : 'B'} kitapçığının PDF'inde okunabilir yazı yok (taranmış). Yayınevinden dijital PDF ya da B karşılık tablosu isteyin.`);
      const out: SubjectMatch[] = [];
      for (const s of keyed) {
        const a = A.bySubject[s.key];
        const b = B.bySubject[s.key];
        if (!a || !b) continue;
        const list = questions[s.key] || [];
        const mapped = list.some((q) => q.bNo && q.bNo !== q.no);
        out.push(matchSubject(s, list, a, b, mapped ? bookletKey(s, questions, 'B') : null));
      }
      if (!out.length) throw new Error('Kitapçıklarda soru numaraları bulunamadı. Doğru dosyaları seçtiğinizden emin olun.');
      setRes(out);
    } catch (e: any) {
      setErr(e?.message || 'Kitapçıklar okunamadı.');
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!res) return;
    const next = { ...questions };
    for (const m of res) next[m.subject.key] = applyMatch(questions[m.subject.key] || [], m);
    const changed = res.reduce((a, m) => a + m.changed, 0);
    const check = res.reduce((a, m) => a + m.pairs.filter((p) => p.status !== 'kesin').length, 0);
    onApply(
      next,
      `Kitapçık eşleşmesi uygulandı: ${res.map((m) => m.subject.short).join(', ')} · ${changed} sorunun B numarası değişti${check ? ` · ${check} soruyu kontrol edin` : ''}.`
    );
    onClose();
  };

  const pick = (side: Side) => (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs font-semibold text-fg">{side} kitapçığı</span>
      <button type="button" className={cx(BTN, 'ui-btn-secondary')} disabled={busy} onClick={() => refs[side].current?.click()} id={`kit-${side}`}>
        <FileText /> PDF seç
      </button>
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{files[side].length ? files[side].map((f) => f.name).join(', ') : 'Seçilmedi'}</span>
      <input
        ref={refs[side]}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const fs = Array.from(e.target.files || []);
          setFiles((cur) => ({ ...cur, [side]: fs }));
          setRes(null);
          e.target.value = '';
        }}
      />
    </div>
  );

  const total = res ? res.reduce((a, m) => a + m.pairs.length, 0) : 0;
  const sure = res ? res.reduce((a, m) => a + m.sure, 0) : 0;

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      size="md"
      id="kitapcik-eslestir"
      icon={ArrowLeftRight}
      title="Kitapçıkla soru eşleştir"
      description="A ve B kitapçığındaki aynı sorular metinlerinden bulunur."
      footer={
        <>
          <button type="button" className={cx(BTN, 'ui-btn-secondary')} disabled={busy} onClick={onClose}>
            Vazgeç
          </button>
          {res ? (
            <button type="button" className={cx(BTN, 'ui-btn-primary')} onClick={apply} id="kit-uygula">
              Uygula
            </button>
          ) : (
            <button type="button" className={cx(BTN, 'ui-btn-primary')} disabled={busy || !files.A.length || !files.B.length} onClick={() => void run()} id="kit-eslestir">
              {busy ? 'Okunuyor' : 'Eşleştir'}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-2">
          {pick('A')}
          {pick('B')}
        </div>
        <p className="text-[11px] text-muted">
          Sözel ve sayısal ayrı dosyaysa ikisini birlikte seçin. Yazısı seçilebilen (dijital) PDF gerekir. Dosyalar yalnızca bu bilgisayarda okunur, hiçbir yere yüklenmez.
        </p>
        {err && (
          <p role="alert" className="text-xs font-semibold text-danger-fg bg-danger-soft rounded-lg px-2.5 py-1.5">
            {err}
          </p>
        )}
        {res && (
          <div className="space-y-2" id="kit-sonuc">
            <p className={cx('text-xs font-semibold rounded-lg px-2.5 py-1.5', sure === total ? 'bg-success-soft text-success-fg' : 'bg-warning-soft text-warning-fg')}>
              {sure === total ? `${total} sorunun hepsi kesin eşleşti.` : `${total} sorudan ${sure} tanesi kesin eşleşti; sarı soruları kitapçıktan kontrol edin.`}
            </p>
            <ul className="rounded-lg border border-line divide-y divide-line text-xs">
              {res.map((m) => {
                const odd = m.pairs.filter((p) => p.status !== 'kesin');
                const moved = m.pairs.filter((p) => p.bNo && p.bNo !== p.oldBNo);
                return (
                  <li key={m.subject.key} className="px-2.5 py-1.5 space-y-1" data-ders={m.subject.key}>
                    <div className="flex items-center gap-2">
                      <b className="text-fg min-w-0 flex-1 truncate">{m.subject.name}</b>
                      <span className="tabular-nums text-muted">
                        {m.sure}/{m.pairs.length} kesin
                      </span>
                      <span className={cx('ui-chip', moved.length ? 'ui-chip-brand' : 'ui-chip-neutral')}>{moved.length ? `${moved.length} değişiklik` : 'Değişiklik yok'}</span>
                    </div>
                    {moved.length > 0 && (
                      <p className="text-[11px] text-fg-2">
                        {moved.map((p) => `${p.aNo}. soru: B'de ${p.bNo} (şimdi ${p.oldBNo})`).join(' · ')}
                      </p>
                    )}
                    {odd.length > 0 && (
                      <p className="text-[11px] font-semibold text-warning-fg">
                        Kontrol: {odd.map((p) => `${p.aNo}. soru${p.status === 'harf' ? ' (cevap harfi uyuşmuyor)' : p.status === 'yok' ? ' (metin bulunamadı)' : ` (benzerlik %${p.sim})`}`).join(' · ')}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            {keyed.some((s) => !res.some((m) => m.subject.key === s.key)) && (
              <p className="text-[11px] text-muted">
                Kitapçıklarda bulunamayan dersler: {keyed.filter((s) => !res.some((m) => m.subject.key === s.key)).map((s) => s.short).join(', ')} (B numaraları değişmez).
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
