// Deneme sihirbazı › çıkış onayı, oturum birleştirme ve anahtar önerisi pencereleri (Aşama 363: ayrı parça)
import { Link2, Save, Trash2 } from 'lucide-react';
import { Modal, cx } from '../../ui/kit';
import { OgrenciSecici } from '../OgrenciSecici';
import { SQ_BTN } from './ortak';
import { useSihirbazBaglam } from './useSihirbaz';

export function SihirbazPencereleri() {
  const { onCancel, name, pairs, pairIdx, pairOpen, setPairOpen, pairStudent, setPairStudent, draftBusy, left, leaveAsk, setLeaveAsk, deleteAsk, setDeleteAsk, studentById, sortedStudents, saveAndLeave, doDeleteDraft, sessionLabel, pair, pairA, pairB, resolvePair } = useSihirbazBaglam();
  return (
    <>
      <Modal
        open={pairOpen && !!pair}
        onClose={() => setPairOpen(false)}
        title="Aynı öğrenci mi?"
        description={pairs.length > 1 ? `Öneri ${pairIdx + 1} / ${pairs.length}` : undefined}
        icon={Link2}
        tone="warning"
        size="sm"
        id="dn-pair-modal"
        footer={
          <>
            <button type="button" className={cx(SQ_BTN, 'ui-btn-secondary')} onClick={() => resolvePair(false)} id="dn-pair-ayri">
              Ayrı kalsın
            </button>
            <button type="button" className={cx(SQ_BTN, 'ui-btn-primary')} disabled={!pairStudent || !pairA || !pairB} onClick={() => resolvePair(true)} id="dn-pair-birlestir">
              Birleştir
            </button>
          </>
        }
      >
        {pair && (
          <div className="space-y-2 text-xs">
            <p className="text-warning-fg font-semibold">{pair.reason}</p>
            {[pairA, pairB].map((m, i) =>
              m ? (
                <div key={m.group.key} className="rounded-xl border border-line px-3 py-1.5">
                  <p className="font-semibold text-fg truncate">
                    {sessionLabel(m.group)} · {m.group.name || '—'}
                  </p>
                  <p className="text-muted truncate">
                    No {m.group.number || '—'} · {[m.group.grade, m.group.section].filter(Boolean).join('/') || 'sınıf yok'} · {m.group.sources[0]}
                  </p>
                </div>
              ) : (
                <p key={i} className="text-muted">Satır listede yok (atlanmış ya da değişmiş).</p>
              )
            )}
            <div>
              <p className="ui-eyebrow mb-1">Öğrenci</p>
              <OgrenciSecici
                students={sortedStudents}
                byId={studentById}
                candidates={Array.from(new Set([...(pairA?.candidates || []), ...(pairB?.candidates || [])]))}
                value={pairStudent}
                onChange={setPairStudent}
              />
            </div>
            <p className="text-xs text-muted">Birleştirince iki satır seçtiğiniz öğrencide tek sonuç olur ve sonraki yüklemelerde kendiliğinden birleşir.</p>
          </div>
        )}
      </Modal>
      <Modal
        open={leaveAsk}
        onClose={() => !draftBusy && setLeaveAsk(false)}
        title="Değişiklikler kaydedilmedi"
        description="Kaydederseniz sonra Deneme listesinden kaldığınız yerden devam edersiniz."
        icon={Save}
        tone="warning"
        size="sm"
        footer={
          <>
            <button type="button" className={cx(SQ_BTN, 'ui-btn-secondary')} disabled={draftBusy} onClick={() => setLeaveAsk(false)}>
              Vazgeç
            </button>
            <button
              type="button"
              className={cx(SQ_BTN, 'ui-btn-danger-soft')}
              disabled={draftBusy}
              onClick={() => {
                left.current = true;
                setLeaveAsk(false);
                onCancel();
              }}
            >
              Kaydetmeden çık
            </button>
            <button type="button" className={cx(SQ_BTN, 'ui-btn-primary')} disabled={draftBusy || !name.trim()} onClick={() => void saveAndLeave()} id="deneme-kaydet-cik">
              <Save /> {draftBusy ? 'Kaydediliyor…' : 'Kaydet ve çık'}
            </button>
          </>
        }
      >
        <p className="text-xs text-fg-2">
          {name.trim() ? 'Deneme bilgileri, cevap anahtarı ve okunan optik dosyaları saklanır. TXT dosyasının kendisi ve TC numaraları saklanmaz.' : 'Kaydetmek için önce deneme adını yazın.'}
        </p>
      </Modal>

      <Modal
        open={deleteAsk}
        onClose={() => !draftBusy && setDeleteAsk(false)}
        title="Taslak silinsin mi?"
        description={`"${name.trim() || 'Yeni deneme'}" taslağı kalıcı olarak silinir.`}
        icon={Trash2}
        tone="danger"
        size="sm"
        footer={
          <>
            <button type="button" className={cx(SQ_BTN, 'ui-btn-secondary')} disabled={draftBusy} onClick={() => setDeleteAsk(false)}>
              Vazgeç
            </button>
            <button type="button" className={cx(SQ_BTN, 'ui-btn-danger')} disabled={draftBusy} onClick={() => void doDeleteDraft()}>
              <Trash2 /> Sil
            </button>
          </>
        }
      >
        <p className="text-xs text-fg-2">Cevap anahtarı ve okunan optik verisi de silinir. Kayıtlı optik formatları silinmez.</p>
      </Modal>
    </>
  );
}
export default SihirbazPencereleri;
