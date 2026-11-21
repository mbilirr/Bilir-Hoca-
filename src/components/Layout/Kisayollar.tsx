import React, { useEffect, useRef, useState } from 'react';
import { Keyboard } from 'lucide-react';
import type { TeacherTabType } from '../../types';
import { dataService } from '../../services/dataService';
import { Modal } from '../ui/kit';
import { TEACHER_NAV } from './navItems';

// ============================================================================
// Aşama 316: KLAVYE KISAYOLLARI
// - "?" kısayol listesini açar. "G" ardından bir harf o sayfaya götürür (ör. G sonra Ö = Öğrenciler).
// - Yalnız yazı alanında değilken ve açık pencere yokken çalışır; kişinin açık olmayan sayfaları listede de yoktur.
// - Liste ayrıca hesap menüsünden ve hızlı aramanın altından açılır. Telefonda klavye olmadığı için giriş yeri gizlidir.
// ============================================================================

export const KISAYOL_AC_EVENT = 'app-open-shortcuts';
export const kisayollariAc = () => window.dispatchEvent(new Event(KISAYOL_AC_EVENT));

// Sayfa harfleri (Türkçe klavyede de aynı tuş). İlk harf ana tuştur, listede o gösterilir.
const SAYFA_HARF: Partial<Record<TeacherTabType, string[]>> = {
  home: ['a'],
  students: ['ö', 'o'],
  homework: ['v'],
  etuts: ['e'],
  grades: ['d'],
  messages: ['m'],
  question_tracking: ['s'],
  deneme: ['n'],
  akademik_takvim: ['t'],
  archive: ['r'],
  user_management: ['y'],
};
const BEKLEME_MS = 1200; // "G"den sonra harf için süre

const macMi = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');

const yaziAlaninda = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};
// Kapalı ama sayfada duran yan pencereler (ana sayfa çekmeceleri) aria-hidden taşır; onlar sayılmaz
const pencereAcik = () => !!document.querySelector('[role="dialog"][aria-modal="true"]:not([aria-hidden="true"])');

const Tus: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-lg border border-line bg-surface-2 text-xs font-semibold text-fg-2 font-sans shadow-[inset_0_-1px_0_var(--color-line)]">
    {children}
  </kbd>
);

// tuslar: tuş grupları (gruplar arasında "veya"); bir grubun tuşları arasında `ara` yazar (ör. "+", "sonra")
const Satir: React.FC<{ ad: string; tuslar: string[][]; ara?: string }> = ({ ad, tuslar, ara }) => (
  <li className="h-10 flex items-center justify-between gap-3 px-3 border-b border-line last:border-b-0">
    <span className="text-sm text-fg truncate">{ad}</span>
    <span className="shrink-0 flex items-center gap-1 text-xs text-subtle">
      {tuslar.map((grup, g) => (
        <React.Fragment key={g}>
          {g > 0 && <span className="px-1">veya</span>}
          {grup.map((t, i) => (
            <React.Fragment key={i}>
              {i > 0 && ara && <span className="px-0.5">{ara}</span>}
              <Tus>{t}</Tus>
            </React.Fragment>
          ))}
        </React.Fragment>
      ))}
    </span>
  </li>
);

export const Kisayollar: React.FC<{ isAdmin: boolean; onNavigate: (tab: TeacherTabType) => void }> = ({ isAdmin, onNavigate }) => {
  const [acik, setAcik] = useState(false);
  const gBekliyor = useRef(0); // "G"ye basılma zamanı (0 = beklemiyor)
  const gitRef = useRef(onNavigate);
  gitRef.current = onNavigate;
  const adminRef = useRef(isAdmin);
  adminRef.current = isAdmin;

  const kullanilir = (tab: TeacherTabType) => (tab === 'user_management' ? adminRef.current && dataService.canUseTab(tab) : dataService.canUseTab(tab));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (yaziAlaninda(e.target) || pencereAcik()) {
        gBekliyor.current = 0;
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        gBekliyor.current = 0;
        setAcik(true);
        return;
      }
      const k = (e.key || '').toLocaleLowerCase('tr-TR');
      if (gBekliyor.current && Date.now() - gBekliyor.current < BEKLEME_MS) {
        gBekliyor.current = 0;
        const hedef = (Object.keys(SAYFA_HARF) as TeacherTabType[]).find((t) => SAYFA_HARF[t]!.includes(k));
        if (hedef && kullanilir(hedef)) {
          e.preventDefault();
          gitRef.current(hedef);
        }
        return;
      }
      gBekliyor.current = k === 'g' && !e.shiftKey ? Date.now() : 0;
    };
    const onAc = () => setAcik(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(KISAYOL_AC_EVENT, onAc);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(KISAYOL_AC_EVENT, onAc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!acik) return null;
  const mod = macMi() ? '⌘' : 'Ctrl';
  const sayfalar = TEACHER_NAV.filter((n) => SAYFA_HARF[n.id] && kullanilir(n.id));

  return (
    <Modal open={acik} onClose={() => setAcik(false)} id="klavye-kisayollari" icon={Keyboard} title="Klavye kısayolları" description="Yazı alanında değilken çalışır.">
      <div className="space-y-4">
        <section>
          <p className="ui-eyebrow px-1 pb-1.5">Genel</p>
          <ul className="rounded-xl border border-line bg-surface overflow-hidden">
            <Satir ad="Hızlı arama" tuslar={[[mod, 'K'], ['/']]} ara="+" />
            <Satir ad="Bu listeyi aç" tuslar={[['?']]} />
            <Satir ad="Pencereyi kapat" tuslar={[['Esc']]} />
            <Satir ad="Aramada gezin, aç" tuslar={[['↑', '↓', 'Enter']]} />
          </ul>
        </section>
        {sayfalar.length > 0 && (
          <section>
            <p className="ui-eyebrow px-1 pb-1.5">Sayfaya git: önce G, sonra harf</p>
            <ul className="rounded-xl border border-line bg-surface overflow-hidden">
              {sayfalar.map((n) => (
                <Satir key={n.id} ad={n.title} tuslar={[['G', SAYFA_HARF[n.id]![0].toLocaleUpperCase('tr-TR')]]} ara="sonra" />
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
};
