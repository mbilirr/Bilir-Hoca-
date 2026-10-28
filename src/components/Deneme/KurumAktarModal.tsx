import React, { useEffect, useMemo, useState } from 'react';
import { Building2 } from 'lucide-react';
import { Modal, Segmented, cx } from '../ui/kit';
import { dataService } from '../../services/dataService';
import type { DenemeExam } from '../../services/denemeService';
import { dateTr } from '../../lib/deneme/karneModel';
import { copyExamToKurum, copyFormatsToKurum, moveExamToHead, moveExamToKurum } from '../../lib/deneme/kurumAktar';

// ============================================================================
// Aşama 92: denemeleri başka kuruma aktarma penceresi (yalnızca genel yönetici).
// Aşama 98: "Optik formatlarımı da kopyala" seçeneği; geri = kuruma geçmişken denemeyi genel yöneticiye geri taşıma.
// ============================================================================

const BTN = 'ui-btn ui-btn-sm w-28 justify-center';
type Mode = 'kopya' | 'tasi';

export const KurumAktarModal: React.FC<{ open: boolean; onClose: () => void; exams: DenemeExam[]; onDone: (text: string) => void; geri?: boolean }> = ({
  open,
  onClose,
  exams,
  onDone,
  geri = false,
}) => {
  const [kurumlar, setKurumlar] = useState<Array<{ id: string; name: string }>>([]);
  const [target, setTarget] = useState('');
  const [mode, setMode] = useState<Mode>('kopya');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [withFormats, setWithFormats] = useState(true);

  useEffect(() => {
    if (geri) return;
    let alive = true;
    dataService
      .listKurumlar()
      .then((l) => alive && setKurumlar(l.map((k) => ({ id: k.id, name: k.name }))))
      .catch((e) => alive && setErr(e?.message || 'Kurumlar okunamadı.'));
    return () => {
      alive = false;
    };
  }, [geri]);

  // Taşımada hedef kurumdaki denemeler listede gösterilmez
  const list = useMemo(
    () => (geri ? exams.filter((e) => !!e.kurumId) : exams.filter((e) => mode === 'kopya' || (e.kurumId || '') !== target)),
    [exams, mode, target, geri]
  );
  const sel = list.filter((e) => picked.has(e.id));
  const allOn = list.length > 0 && sel.length === list.length;
  const kurumName = (id?: string | null) => (id ? kurumlar.find((k) => k.id === id)?.name || 'Kurum' : 'Genel yönetici');

  const run = async () => {
    if ((!geri && !target) || !sel.length) return;
    setErr(null);
    let ok = 0;
    const fails: string[] = [];
    let fmtNote = '';
    if (!geri && withFormats) {
      setBusy('Formatlar…');
      try {
        const n = await copyFormatsToKurum(target);
        fmtNote = n ? ` Optik formatlarınız (${n}) da kopyalandı.` : '';
      } catch (e: any) {
        fails.push(e?.message || 'Optik formatları kopyalanamadı');
      }
    }
    for (let i = 0; i < sel.length; i++) {
      setBusy(`${i + 1} / ${sel.length}`);
      try {
        if (geri) await moveExamToHead(sel[i].id);
        else if (mode === 'kopya') await copyExamToKurum(sel[i].id, target);
        else await moveExamToKurum(sel[i].id, target);
        ok++;
      } catch (e: any) {
        fails.push(`${sel[i].name}: ${e?.message || 'aktarılamadı'}`);
      }
    }
    setBusy('');
    const name = kurumName(target);
    if (fails.length) setErr(`${ok} deneme aktarıldı; ${fails.length} işlem yapılamadı (${fails[0]}).`);
    else {
      onDone(
        geri
          ? `${ok} deneme sonuçlarıyla birlikte genel yöneticinin paneline geri taşındı.`
          : mode === 'kopya'
            ? `${ok} deneme "${name}" kurumuna taslak olarak kopyalandı; o kurum optik dosyalarını yükleyerek sonuçlarını alır.${fmtNote}`
            : `${ok} deneme sonuçlarıyla birlikte "${name}" kurumuna taşındı.${fmtNote}`
      );
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      size="md"
      id="kurum-aktar"
      icon={Building2}
      title={geri ? 'Genel yöneticiye geri taşı' : 'Denemeleri kuruma aktar'}
      description={geri ? 'Seçilen denemeler bu kurumdan çıkar, kendi panelinize döner.' : 'Seçilen denemeler başka bir kurumda görünür.'}
      footer={
        <>
          <button type="button" className={cx(BTN, 'ui-btn-secondary')} disabled={!!busy} onClick={onClose}>
            Vazgeç
          </button>
          <button type="button" className={cx(BTN, 'ui-btn-primary')} disabled={!!busy || (!geri && !target) || !sel.length} onClick={() => void run()} id="kurum-aktar-btn">
            {busy || (geri ? 'Geri taşı' : 'Aktar')}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-xs">
        {geri ? (
          <p className="rounded-lg px-2.5 py-1.5 bg-warning-soft text-warning-fg" id="kurum-aktar-geri-bilgi">
            Seçilen denemeler sonuçlarıyla birlikte genel yöneticinin paneline geri taşınır ve bu kurumda görünmez. Yalnızca yanlışlıkla
            taşınan denemeler için kullanın; kopyalanan taslakları silmeniz yeterlidir.
          </p>
        ) : (
        <>
        <div className="flex flex-wrap items-center gap-2">
          <label className="w-20 font-semibold text-fg" htmlFor="kurum-aktar-hedef">
            Hedef kurum
          </label>
          <select id="kurum-aktar-hedef" className="ui-input h-8 py-0 text-xs w-56" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Kurum seçin</option>
            {kurumlar.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 font-semibold text-fg">Aktarma</span>
          <Segmented
            size="sm"
            value={mode}
            onChange={setMode}
            items={[
              { value: 'kopya', label: 'Kopyala', id: 'kurum-aktar-kopya' },
              { value: 'tasi', label: 'Taşı', id: 'kurum-aktar-tasi' },
            ]}
          />
        </div>
        <p className={cx('rounded-lg px-2.5 py-1.5', mode === 'kopya' ? 'bg-info-soft text-info-fg' : 'bg-warning-soft text-warning-fg')}>
          {mode === 'kopya'
            ? 'Cevap anahtarı, B kitapçığı eşleşmesi ve kazanımlar hedef kuruma taslak olarak kopyalanır; o kurum kendi optik dosyalarını yükler. Öğrenci sonuçları kopyalanmaz.'
            : 'Deneme sonuçlarıyla birlikte hedef kuruma geçer ve eski kurumunda görünmez. Öğrencileri de o kuruma taşıdıysanız kullanın.'}
        </p>
        <label className="flex items-center gap-2 font-semibold text-fg cursor-pointer" id="kurum-aktar-format">
          <input type="checkbox" checked={withFormats} onChange={(e) => setWithFormats(e.target.checked)} />
          Optik formatlarımı da kopyala <span className="font-normal text-muted">(kurum optik dosyalarını aynı formatla okur)</span>
        </label>
        </>
        )}
        <div className="rounded-lg border border-line">
          <label className="flex items-center gap-2 border-b border-line px-2.5 py-1.5 font-semibold text-fg cursor-pointer">
            <input type="checkbox" checked={allOn} onChange={() => setPicked(allOn ? new Set() : new Set(list.map((e) => e.id)))} />
            Tümünü seç <span className="font-normal text-muted">({sel.length} / {list.length})</span>
          </label>
          <ul className="max-h-56 overflow-y-auto divide-y divide-line">
            {list.map((e) => (
              <li key={e.id}>
                <label className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-surface-2/50">
                  <input
                    type="checkbox"
                    checked={picked.has(e.id)}
                    onChange={() =>
                      setPicked((cur) => {
                        const n = new Set(cur);
                        if (n.has(e.id)) n.delete(e.id);
                        else n.add(e.id);
                        return n;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1 truncate text-fg">{e.name}</span>
                  <span className="shrink-0 text-[11px] text-muted">
                    {dateTr(e.examDate)} · {kurumName(e.kurumId)}
                  </span>
                </label>
              </li>
            ))}
            {!list.length && <li className="px-2.5 py-2 text-muted">Aktarılacak deneme yok.</li>}
          </ul>
        </div>
        {err && (
          <p role="alert" className="font-semibold text-danger-fg bg-danger-soft rounded-lg px-2.5 py-1.5">
            {err}
          </p>
        )}
      </div>
    </Modal>
  );
};
