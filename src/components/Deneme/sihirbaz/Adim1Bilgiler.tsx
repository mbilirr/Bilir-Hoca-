// Deneme sihirbazı › 1. adım: deneme bilgileri ve cevap anahtarı (Aşama 363: ayrı parça)
import { ChevronDown, FileText } from 'lucide-react';
import { Panel } from '../../ui/kit';
import { InfoTip } from '../../ui/Compact';
import { AnahtarEditor } from '../AnahtarEditor';
import { normalizeQuestions } from '../../../lib/deneme/lgs';
import { YANLIS_SECENEK } from './ortak';
import { useSihirbazBaglam } from './useSihirbaz';

export function Adim1Bilgiler() {
  const { existing, grade, lgs, subjects, subjectsRef, yanlis, setYanlis, countNote, step, name, setName, publisher, setPublisher, examDate, setExamDate, questions, setQuestions, fileMeta, setCount } = useSihirbazBaglam();
  return (
    <>
      {step === 1 && (
        <Panel title="Deneme bilgileri" icon={FileText} tone="brand">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="ui-label" htmlFor="dn-name">Deneme adı</label>
              <input id="dn-name" className="ui-input" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder="Örn. Turuncu Kuşak Deneme 1" />
            </div>
            <div>
              <label className="ui-label" htmlFor="dn-pub">Yayınevi</label>
              <input id="dn-pub" className="ui-input" value={publisher} maxLength={120} onChange={(e) => setPublisher(e.target.value)} placeholder="Örn. Doğru Tahmin" />
            </div>
            <div>
              <label className="ui-label" htmlFor="dn-date">Sınav tarihi</label>
              <input id="dn-date" type="date" className="ui-input" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
            </div>
          </div>
          <div className="mt-4">
            {/* Aşama 271: 5-7'de soru sayısı ve yanlış etkisi (yayınevine göre); 8 LGS'de sabit */}
            {!lgs && (
              <div className="mb-4 rounded-xl border border-line bg-surface-2/50 p-3" id="dn-sinif-ayar">
                <div className="flex flex-wrap items-end gap-3">
                  {subjects.map((x) => (
                    <div key={x.key} className="w-20">
                      <label className="ui-label truncate" htmlFor={`dn-say-${x.key}`} title={x.name}>
                        {x.short}
                      </label>
                      <input
                        id={`dn-say-${x.key}`}
                        type="number"
                        min={1}
                        max={40}
                        inputMode="numeric"
                        className="ui-input text-center tabular-nums"
                        value={x.count}
                        disabled={!!existing}
                        onChange={(e) => setCount(x.key, Number(e.target.value))}
                      />
                    </div>
                  ))}
                  <div className="min-w-56">
                    <label className="ui-label" htmlFor="dn-yanlis">Yanlış etkisi</label>
                    <div className="relative">
                      <select
                        id="dn-yanlis"
                        className="ui-input cursor-pointer appearance-none pr-8"
                        value={yanlis}
                        disabled={!!existing}
                        onChange={(e) => setYanlis(Number(e.target.value))}
                      >
                        {YANLIS_SECENEK.map((o) => (
                          <option key={o.v} value={o.v}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle" aria-hidden />
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted flex items-center gap-1">
                  Soru sayısı cevap anahtarı dosyasından kendiliğinden ayarlanır; dosyada yoksa buradan yazın.
                  <InfoTip text="MEB'in 5-6-7. sınıflar için resmî puanı yoktur. Puan LGS yöntemiyle hesaplanır: Türkçe, Matematik ve Fen ×4, diğer dersler ×1; bütün sorular doğruysa 500." />
                </p>
              </div>
            )}
            {countNote && (
              <p role="status" className="mb-3 text-xs font-semibold text-info-fg bg-info-soft rounded-xl px-3 py-2" id="dn-dosya-notu">
                {countNote}
              </p>
            )}
            <p className="ui-eyebrow mb-2">{lgs ? 'Cevap anahtarı ve kazanımlar (8. sınıf LGS)' : `Cevap anahtarı ve kazanımlar (${grade}. sınıf)`}</p>
            <AnahtarEditor
              subjects={subjects}
              grade={grade}
              questions={questions}
              examDate={examDate}
              onChange={(q) => setQuestions(normalizeQuestions(subjectsRef.current, q))}
              onExcelMeta={(r) => {
                if (!name.trim() && r.examName) setName(r.examName.slice(0, 200));
                if (r.examDate && !existing) setExamDate(r.examDate);
                fileMeta(r);
              }}
            />
          </div>
        </Panel>
      )}
    </>
  );
}
export default Adim1Bilgiler;
