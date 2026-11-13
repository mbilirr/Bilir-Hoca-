import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, CheckCircle2, Lock, AlertTriangle } from 'lucide-react';
import { Modal, cx } from '../ui/kit';
import { SelectBox } from '../Teacher/FormParts';
import { dataService } from '../../services/dataService';
import type { ClassGroup, KurumInfo } from '../../types';

// ============================================================================
// Aşama 259: KENDİ ALANIM > BİREYSEL HESABA TAŞI (yalnız sistem sahibi, kendi panelinde)
// Kendi alanındaki sınıflar öğrencileri ve geçmiş kayıtlarıyla (ödev, etüt, plan, soru hedefi, mesaj…) bir bireysel
// hesaba taşınır (sql/259 kendi_alani_tasi; tek işlem). Kurumlara açık sınıflar kilitli: o kurumlar etkilenmez.
// ============================================================================

const BTN = 'ui-btn ui-btn-sm h-8 w-28 justify-center';

const SONUC: Array<[string, string]> = [
  ['sinif', 'sınıf'],
  ['ogrenci', 'öğrenci'],
  ['odev', 'ödev'],
  ['etut', 'etüt'],
  ['plan_gorevi', 'plan görevi'],
  ['mesaj', 'mesaj'],
];

export const KendiAlaniTasima: React.FC<{ classes: ClassGroup[] }> = ({ classes }) => {
  const [open, setOpen] = useState(false);
  const kendi = useMemo(() => classes.filter((c) => !c.kurumId), [classes]);
  if (kendi.length === 0) return null; // taşınacak bir şey kalmadı
  return (
    <div className="ui-card ui-card-pad flex flex-col sm:flex-row sm:items-center gap-3" id="kendi-alani-tasima">
      <span className="w-9 h-9 rounded-xl bg-brand-soft text-brand-fg grid place-items-center shrink-0">
        <ArrowRightLeft className="w-4 h-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-fg">Bireysel hesaba taşı</p>
        <p className="text-[11px] text-muted">Kendi alanınızdaki sınıflar öğrencileri, ödev, etüt ve planlarıyla bireysel hesabınıza geçer.</p>
      </div>
      <button type="button" className={cx(BTN, 'ui-btn-primary shrink-0')} onClick={() => setOpen(true)} id="kendi-alani-tasi-ac">
        Taşı
      </button>
      {open && <TasimaPencere classes={kendi} onClose={() => setOpen(false)} />}
    </div>
  );
};

const TasimaPencere: React.FC<{ classes: ClassGroup[]; onClose: () => void }> = ({ classes, onClose }) => {
  const [kurumlar, setKurumlar] = useState<KurumInfo[] | null>(null);
  const [hedef, setHedef] = useState('');
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [onay, setOnay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<Record<string, number> | null>(null);

  // kurum listesi: hedefler (bireysel) ve açık sınıfların kurumları
  useEffect(() => {
    let iptal = false;
    dataService
      .listKurumlar()
      .then((l) => {
        if (iptal) return;
        setKurumlar(l);
        const b = l.filter((k) => k.tur === 'bireysel');
        if (b.length === 1) setHedef(b[0].id);
      })
      .catch((e) => !iptal && setErr(e?.message || 'Kurumlar okunamadı.'));
    return () => {
      iptal = true;
    };
  }, []);

  const acikKurum = useMemo(() => {
    const m = new Map<string, string[]>();
    (kurumlar || []).forEach((k) => k.grantedClassIds.forEach((cid) => m.set(cid, [...(m.get(cid) || []), k.name])));
    return m;
  }, [kurumlar]);
  const ogrenciSay = useMemo(() => {
    const m = new Map<string, number>();
    dataService.getAllStudents().forEach((s) => {
      if (!s.kurumId) m.set(s.classId, (m.get(s.classId) || 0) + 1);
    });
    return m;
  }, []);
  const tasinabilir = useMemo(() => classes.filter((c) => !acikKurum.has(c.id)), [classes, acikKurum]);
  // kurum listesi gelince taşınabilir sınıfların hepsi seçili başlar
  useEffect(() => {
    if (kurumlar) setSecili(new Set(tasinabilir.map((c) => c.id)));
  }, [kurumlar, tasinabilir]);

  const bireyseller = (kurumlar || []).filter((k) => k.tur === 'bireysel');
  const nOgr = [...secili].reduce((a, id) => a + (ogrenciSay.get(id) || 0), 0);
  const hazir = !!hedef && secili.size > 0 && !busy;
  const hedefAd = bireyseller.find((k) => k.id === hedef)?.name || '';

  const tasi = async () => {
    if (!hazir) return;
    if (!onay) {
      setOnay(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      setSonuc(await dataService.kendiAlaniTasi(hedef, [...secili]));
    } catch (e: any) {
      setErr(e?.message || 'Taşınamadı.');
      setOnay(false);
    } finally {
      setBusy(false);
    }
  };
  const degis = (id: string) => {
    setOnay(false);
    setSecili((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      closeOnBackdrop={false}
      size="md"
      id="kendi-alani-tasima-pencere"
      icon={ArrowRightLeft}
      title="Bireysel hesaba taşı"
      description={sonuc ? 'Taşıma tamamlandı.' : 'Seçtiğiniz sınıflar her şeyiyle bireysel hesaba geçer. Bu işlem geri alınmaz.'}
      footer={
        sonuc ? (
          <button type="button" className={cx(BTN, 'ui-btn-primary')} onClick={onClose} id="kendi-alani-tasima-kapat">
            Kapat
          </button>
        ) : (
          <>
            <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={onClose} disabled={busy}>
              Vazgeç
            </button>
            <button
              type="button"
              className={cx('ui-btn ui-btn-sm h-8 w-28 justify-center', onay ? 'ui-btn-danger' : 'ui-btn-primary')}
              onClick={() => void tasi()}
              disabled={!hazir}
              id="kendi-alani-tasi"
            >
              {busy ? 'Taşınıyor…' : onay ? 'Eminim, taşı' : 'Taşı'}
            </button>
          </>
        )
      }
    >
      {sonuc ? (
        <div className="space-y-2.5 text-xs" id="kendi-alani-tasima-sonuc">
          <p className="flex items-start gap-2 rounded-lg bg-success-soft text-success-fg px-2.5 py-2 font-semibold">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>"{hedefAd}" hesabına taşındı.</span>
          </p>
          <div className="grid grid-cols-3 gap-2">
            {SONUC.map(([k, ad]) => (
              <div key={k} className="rounded-lg border border-line bg-canvas px-2.5 py-1.5">
                <span className="block text-base font-bold text-fg tabular-nums">{sonuc[k] ?? 0}</span>
                <span className="block text-[11px] text-muted">{ad}</span>
              </div>
            ))}
          </div>
          {(sonuc.odev_ortak ?? 0) > 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-warning-soft text-warning-fg px-2.5 py-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{sonuc.odev_ortak} ödev taşınmayan öğrencileri de kapsadığı için kendi alanınızda kaldı.</span>
            </p>
          )}
          <p className="text-muted">Denemeleri taşımak için: Deneme Analizi › sınav › "Kuruma aktar".</p>
        </div>
      ) : (
        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-fg-2 mb-1" htmlFor="kendi-alani-hedef">
              Hedef bireysel hesap
            </label>
            <SelectBox
              id="kendi-alani-hedef"
              value={hedef}
              onChange={(e) => {
                setHedef(e.target.value);
                setOnay(false);
              }}
              className="ui-input h-8 py-0 text-xs w-full cursor-pointer"
              disabled={busy}
            >
              <option value="">{kurumlar === null ? 'Yükleniyor…' : bireyseller.length ? 'Seçiniz' : 'Önce bireysel hesap açın'}</option>
              {bireyseller.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </SelectBox>
          </div>

          <div>
            <p className="text-[11px] font-bold text-fg-2 mb-1">
              Sınıflar <span className="font-normal text-muted">({secili.size} sınıf · {nOgr} öğrenci)</span>
            </p>
            <ul className="max-h-72 overflow-y-auto rounded-xl border border-line divide-y divide-line" id="kendi-alani-siniflar">
              {classes.map((c) => {
                const acik = acikKurum.get(c.id);
                const on = secili.has(c.id);
                return (
                  <li key={c.id}>
                    <label className={cx('flex items-center gap-2.5 px-3 h-10', acik ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-surface-2')}>
                      {acik ? (
                        <Lock className="w-3.5 h-3.5 text-muted shrink-0" aria-label="Kuruma açık, taşınmaz" />
                      ) : (
                        <input type="checkbox" checked={on} disabled={busy} onChange={() => degis(c.id)} data-sinif={c.id} />
                      )}
                      <span className="flex-1 min-w-0 truncate font-semibold text-fg">{c.name}</span>
                      {acik ? (
                        <span className="ui-chip ui-chip-neutral max-w-[11rem] truncate" title={`${acik.join(', ')} kurumuna açık; taşınmaz`}>
                          {acik.length === 1 ? `Açık: ${acik[0]}` : `${acik.length} kuruma açık`}
                        </span>
                      ) : (
                        <span className="text-muted tabular-nums shrink-0">{ogrenciSay.get(c.id) || 0} öğrenci</span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          {onay && (
            <p className="rounded-lg bg-warning-soft text-warning-fg px-2.5 py-1.5 font-semibold" role="status" id="kendi-alani-onay">
              {secili.size} sınıf ve {nOgr} öğrenci "{hedefAd}" hesabına geçecek. Onaylamak için yeniden basın.
            </p>
          )}
          {err && (
            <p role="alert" className="font-semibold text-danger-fg bg-danger-soft rounded-lg px-2.5 py-1.5" id="kendi-alani-hata">
              {err}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
};

export default KendiAlaniTasima;
