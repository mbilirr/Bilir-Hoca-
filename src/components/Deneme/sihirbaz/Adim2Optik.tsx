// Deneme sihirbazı › 2. adım: optik dosyaları (Aşama 363: ayrı parça, yalnız gerekince yüklenir)
import { AlertTriangle, FileText, Pencil, Save, Sparkles, Trash2, Upload } from 'lucide-react';
import { Panel, cx } from '../../ui/kit';
import { InfoTip } from '../../ui/Compact';
import { OptikFormatEditor } from '../OptikFormatEditor';
import { checkFields } from '../../../lib/deneme/optik';
import { HAZIR_FORMATLAR, hazirMi } from '../../../lib/deneme/hazirFormatlar';
import { fixSessionSubjects } from '../../../lib/deneme/oturum';
import { filled, OTO, OTO_AD } from './ortak';
import { useSihirbazBaglam } from './useSihirbaz';

export function Adim2Optik() {
  const { grade, subjects, step, name, formats, formatId, setFormatId, fields, setFields, setFmtText, sequential, setSequential, formatName, setFormatName, formatMsg, setFormatMsg, txtFiles, setTxtFiles, txtRef, left, usesEditor, parsed, allRows, parseErrors, fixHints, keySugs, applyShift, editorFile, sampleLine, sinifUyumsuz, onTxt, setFileFmt, otoDuzenle, applyKeyFix, pickFormat, doSaveFormat, doDeleteFormat } = useSihirbazBaglam();
  return (
    <>
      {step === 2 && (
        <>
          <Panel
            title="Optik formatı"
            description={
              <span className="inline-flex items-center gap-1">
                FMT yükleyin, kayıtlı formatı seçin ya da elle girin.
                <InfoTip text="Sözel ve sayısal için ayrı FMT varsa ikisini de ayrı adla kaydedin; her TXT kendi formatıyla okunur." />
              </span>
            }
            icon={FileText}
            tone="info"
          >
            <div className="flex flex-wrap items-end gap-2 mb-3">
              <div className="min-w-48">
                <label className="ui-label" htmlFor="dn-fmt">Kayıtlı format</label>
                <select id="dn-fmt" className="ui-input" value={formatId} onChange={(e) => pickFormat(e.target.value)}>
                  <option value="">Yeni format</option>
                  {formats.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                  <optgroup label="Hazır formatlar">
                    {HAZIR_FORMATLAR.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <div className="min-w-48 flex-1">
                <label className="ui-label" htmlFor="dn-fmt-name">Format adı</label>
                <input id="dn-fmt-name" className="ui-input" value={formatName} maxLength={120} onChange={(e) => setFormatName(e.target.value)} placeholder="Örn. Sekonic LGS sözel-sayısal" />
              </div>
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={!fields.length || checkFields(fields).length > 0} onClick={() => void doSaveFormat(!formatId)}>
                <Save /> {formatId && !hazirMi(formatId) ? 'Formatı güncelle' : 'Formatı kaydet'}
              </button>
              {formatId && !hazirMi(formatId) && (
                <>
                  <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => void doSaveFormat(true)}>
                    Yeni olarak kaydet
                  </button>
                  <button type="button" className="ui-btn ui-btn-danger-soft ui-btn-sm" onClick={() => void doDeleteFormat()}>
                    <Trash2 /> Sil
                  </button>
                </>
              )}
            </div>
            {formatMsg && <p className="text-xs font-semibold text-info-fg bg-info-soft rounded-xl px-3 py-2 mb-3">{formatMsg}</p>}
            <OptikFormatEditor
              fields={fields}
              subjects={subjects}
              sequential={sequential}
              onSequentialChange={setSequential}
              sampleLine={editorFile ? sampleLine || '' : undefined}
              onChange={(f, text, fileName) => {
                if (text === undefined) {
                  setFields(f);
                  return;
                }
                // Aşama 90: FMT yüklendi. Oturumu karışık bloklar (sözelde "FEN", sayısalda "SOSYAL") düzeltilir
                const fx = fixSessionSubjects(f, subjects, text);
                setFields(fx.fields);
                setFmtText(text);
                // Yeni format: dosyaları önceki formata bağlı kalsın
                if (formatId) setTxtFiles((cur) => cur.map((x) => (x.fmt === '' ? { ...x, fmt: formatId } : x)));
                setFormatId('');
                if (fileName) setFormatName(fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120));
                const nm = (k: string) => subjects.find((s) => s.key === k)?.name || k;
                setFormatMsg(
                  fx.changes.length
                    ? `FMT okundu. Formdaki blok adları oturumun dersleriyle uyuşmadığı için bloklar formdaki yerlerine göre LGS sırasıyla ayarlandı: ${fx.changes.map((c) => `"${c.label}" → ${nm(c.to)}`).join(', ')}. Kontrol edip "Formatı kaydet" deyin.`
                    : 'FMT okundu. Alanları kontrol edip "Formatı kaydet" deyin.'
                );
              }}
            />
          </Panel>

          <Panel
            title="Optik sonuç dosyaları (TXT)"
            description={
              <span className="inline-flex items-center gap-1">
                Sözel ve sayısal TXT'leri birlikte yükleyin.
                <InfoTip text="Her dosya kendi formatıyla okunur (uyan kayıtlı ya da hazır format kendiliğinden seçilir), aynı öğrencinin satırları birleştirilir." />
              </span>
            }
            icon={Upload}
            tone="success"
            actions={
              <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => txtRef.current?.click()}>
                <Upload /> TXT yükle
              </button>
            }
          >
            <input
              ref={txtRef}
              type="file"
              accept=".txt,.TXT,.dat"
              multiple
              className="hidden"
              onChange={(e) => {
                void onTxt(e.target.files);
                e.target.value = '';
              }}
            />
            {txtFiles.length === 0 ? (
              <p className="text-sm text-muted">Henüz dosya yüklenmedi.</p>
            ) : (
              <div className="space-y-2">
                {txtFiles.map((f, i) => {
                  const p = parsed[i];
                  const read = p ? subjects.filter((s) => p.rows.some((r) => filled(r.answers[s.key]))) : [];
                  const sug = keySugs[i] || [];
                  const nm = (k: string) => subjects.find((s) => s.key === k)?.name || k;
                  return (
                    <div key={f.name} className="flex flex-wrap items-start gap-2 border border-line rounded-xl px-3 py-2" data-txt-file={f.name}>
                      <FileText className="w-4 h-4 text-muted mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-fg truncate min-w-0">{f.name}</p>
                          {f.rows ? (
                            <span className="ui-chip ui-chip-neutral" title="Taslakta kayıtlı okunmuş satırlar (TXT'nin kendisi saklanmaz)">
                              Kayıtlı{f.fmtName ? ` · ${f.fmtName}` : ''}
                            </span>
                          ) : (
                            <select
                              className="ui-input py-1 text-xs w-auto max-w-56"
                              value={f.fmt === OTO ? OTO : usesEditor(f) ? '' : f.fmt}
                              onChange={(e) => setFileFmt(f.name, e.target.value)}
                              aria-label={`${f.name} optik formatı`}
                            >
                              <option value="">{formatId ? `${formatName || 'Format'} (düzenlenen)` : `${formatName || 'Yukarıdaki format'} (düzenlenen)`}</option>
                              {f.text && <option value={OTO}>{OTO_AD}</option>}
                              {formats
                                .filter((x) => x.id !== formatId)
                                .map((x) => (
                                  <option key={x.id} value={x.id}>
                                    {x.name}
                                  </option>
                                ))}
                              <optgroup label="Hazır formatlar">
                                {HAZIR_FORMATLAR.filter((x) => x.id !== formatId).map((x) => (
                                  <option key={x.id} value={x.id}>
                                    {x.name}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                          )}
                        </div>
                        {f.fmt === OTO && f.oto && (
                          <div
                            className={cx(
                              'mt-1.5 flex flex-col items-start gap-2 rounded-xl px-3 py-2 text-xs sm:flex-row sm:items-center',
                              f.oto.guvenli ? 'bg-info-soft text-info-fg' : 'bg-warning-soft text-warning-fg'
                            )}
                            data-oto={f.name}
                          >
                            <span className="min-w-0 flex-1 flex items-start gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 shrink-0 mt-px" />
                              <span>
                              {f.oto.guvenli
                                ? 'Uyan FMT olmadığı için sütunlar dosyadan çözüldü. Aşağıdaki tabloda numara, ad ve cevapları kontrol edin.'
                                : `Sütunlar dosyadan çözüldü ama emin olunamadı. ${f.oto.notlar.join(' ')}`}
                              </span>
                            </span>
                            <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-32 justify-center" onClick={() => otoDuzenle(f.name)}>
                              <Pencil /> Alanları düzenle
                            </button>
                          </div>
                        )}
                        {p ? (
                          <>
                            <p className="text-xs text-muted">
                              {p.rows.length} öğrenci satırı{read.length ? ` · ${read.map((s) => s.short).join(' · ')}` : ''}
                            </p>
                            {sug.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning-fg">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                <span className="min-w-0 flex-1">
                                  {sug.map((x) => `"${nm(x.from)}" olarak okunan cevaplar ${x.rateFrom >= 0 ? `kendi anahtarıyla %${x.rateFrom}, ` : ''}${nm(x.to)} anahtarıyla %${x.rateTo} uyuşuyor`).join('; ')}. Optik formdaki ders blokları yanlış adlandırılmış olabilir.
                                </span>
                                <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => void applyKeyFix(i)}>
                                  Düzelt
                                </button>
                              </div>
                            )}
                            {p.errors.map((x) => (
                              <p key={x} className="text-xs font-semibold text-danger-fg">{x}</p>
                            ))}
                            {p.errors.length > 0 && f.text && f.fmt !== OTO && (
                              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-32 justify-center mt-1" onClick={() => setFileFmt(f.name, OTO)}>
                                <Sparkles /> FMT'siz oku
                              </button>
                            )}
                            {p.warnings.map((x) => (
                              <p key={x} className="text-xs text-warning-fg">{x}</p>
                            ))}
                          </>
                        ) : (
                          <p className="text-xs text-warning-fg">Önce optik formatını tamamlayın.</p>
                        )}
                        {fixHints[i] && (
                          <div className="mt-1.5 rounded-xl bg-info-soft px-3 py-2 text-xs text-info-fg space-y-1.5">
                            {fixHints[i]!.fits.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold">Bu dosya kayıtlı formatla uyuşuyor:</span>
                                {fixHints[i]!.fits.map((x) => (
                                  <button key={x.id} type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setFileFmt(f.name, x.id)}>
                                    “{x.name}” formatını kullan
                                  </button>
                                ))}
                              </div>
                            )}
                            {fixHints[i]!.shift !== null && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span>
                                  Alanlar <strong>{Math.abs(fixHints[i]!.shift!)}</strong> karakter {fixHints[i]!.shift! > 0 ? 'sağa' : 'sola'} kaydırılınca dosya formatla
                                  uyuşuyor (FMT'de TXT'ye yazılmayan ya da tarif edilmeyen bir alan olabilir).
                                </span>
                                <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => applyShift(fixHints[i]!.shift!)}>
                                  Alanları kaydır
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon hover:text-danger-fg" aria-label="Dosyayı kaldır" onClick={() => setTxtFiles((cur) => cur.filter((x) => x.name !== f.name))}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
                {sinifUyumsuz > 0 && !parseErrors.length && (
                  <p role="alert" className="text-xs font-semibold text-warning-fg bg-warning-soft rounded-xl px-3 py-2 flex items-start gap-1.5" id="dn-sinif-uyumsuz">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    {/* Aşama 271 */}
                    Optikte {sinifUyumsuz} satırın sınıfı {grade} değil. Bu deneme {grade}. sınıf; başka sınıfın TXT dosyası yüklenmiş olabilir. Eşleştirmede yalnız {grade}. sınıf öğrencileri aday olur.
                  </p>
                )}
                {allRows.length > 0 && !parseErrors.length && (
                  <div className="bg-surface border border-line rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-fg-2">
                        <thead className="bg-surface-2/60 uppercase tracking-wider text-muted border-b border-line">
                          <tr>
                            <th className="px-3 py-2 font-semibold">No</th>
                            <th className="px-3 py-2 font-semibold">Ad soyad (optik)</th>
                            <th className="px-3 py-2 font-semibold">Sınıf</th>
                            <th className="px-3 py-2 font-semibold">Kitapçık</th>
                            {subjects.map((s) => (
                              <th key={s.key} className="px-3 py-2 font-semibold text-center">{s.short}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {allRows.slice(0, 6).map((r) => (
                            <tr key={`${r.file}-${r.line}`}>
                              <td className="px-3 py-1.5 tabular-nums">{r.number || '—'}</td>
                              <td className="px-3 py-1.5 font-semibold text-fg">{r.name || '—'}</td>
                              <td className="px-3 py-1.5">{[r.grade, r.section].filter(Boolean).join('/') || '—'}</td>
                              <td className="px-3 py-1.5">{r.booklet || '—'}</td>
                              {subjects.map((s) => (
                                <td key={s.key} className="px-3 py-1.5 text-center tabular-nums text-muted">
                                  {filled(r.answers[s.key]) ? (r.answers[s.key].match(/[A-E*]/g) || []).length : '·'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="px-3 py-2 text-xs text-muted border-t border-line">
                      İlk 6 satır gösteriliyor (toplam {allRows.length}). Ders sütunları işaretlenen cevap sayısıdır. Ad ve sınıf doğru görünmüyorsa format alanlarını kontrol edin.
                    </p>
                  </div>
                )}
              </div>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
export default Adim2Optik;
