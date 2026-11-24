// Aşama 349b: hangi sayfa hangi veri konusunu okuyor? (canlı değişiklikte yalnız ilgili sayfa yeniden çizilsin diye)
// dataService içindeki her üyenin dokunduğu listeler (this.<alan>) çağrı zinciriyle birlikte bulunur; sonra her
// sayfa dosyasının içe aktardığı (tembel olanlar dahil) bütün dosyalardaki dataService.<üye> kullanımları toplanır.
// Sonuç src/lib/sayfaKonulari.ts içindeki elle yazılmış tabloyla karşılaştırılır: tabloda eksik konu varsa
// denetim düşer (sayfa yeni bir veri okumaya başladıysa tablo da güncellenmeli; yoksa o sayfa bayat kalırdı).
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const KOK = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(KOK, 'src');
const ALANLAR = {
  questionLogs: 'soru',
  submissions: 'teslim',
  messages: 'mesaj',
  grades: 'not',
  attendance: 'yoklama',
  etuts: 'etut',
  homeworks: 'odev',
  documents: 'belge',
  weeklyQuestionTargets: 'hedef',
  etutYoklama: 'etut',
};

function kaynak(dosya) {
  return ts.createSourceFile(dosya, fs.readFileSync(dosya, 'utf8'), ts.ScriptTarget.Latest, true, dosya.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

// 1) dataService üyeleri → konular
const DS = path.join(SRC, 'services/dataService.ts');
export const uyeAlan = new Map(); // üye → Set(konu)
const uyeCagri = new Map(); // üye → Set(üye)
// Yazma / yaşam döngüsü üyeleri okuma sayılmaz (çıkışta listeleri boşaltan, eşitleyen, buluta yazan, bildiren üyeler);
// bunların içinden geçen çağrı zinciri izlenmez. Bir bileşen bunları yalnız düğmeye basınca çağırır.
const YAZAN = /^(notify|logout|clearUserData|scheduleSecureSave|secureSave|save|persist|sync|push|handle|queue|flush|ensure|setup|revalidate|unsubscribe|schedule|refresh|fetch|load|reload|apply|merge|adopt|delete|remove|add|create|update|set|mark|upsert|import|bulk|restore|reset|clear|send|toggle|record|log|verify|bump|canli|run|start|stop|replace|move|assign|archive|undo|commit|write|approve|reject|submit|cancel)/;
{
  const sf = kaynak(DS);
  const sinif = sf.statements.find((s) => ts.isClassDeclaration(s) && s.name?.text === 'DataService');
  for (const m of sinif.members) {
    const ad = m.name && ts.isIdentifier(m.name) ? m.name.text : m.name && ts.isPrivateIdentifier(m.name) ? m.name.text : null;
    if (!ad) continue;
    const alanlar = uyeAlan.get(ad) || new Set();
    const cagrilar = uyeCagri.get(ad) || new Set();
    if (ALANLAR[ad]) alanlar.add(ALANLAR[ad]);
    const gez = (n) => {
      if (ts.isPropertyAccessExpression(n) && n.expression.kind === ts.SyntaxKind.ThisKeyword) {
        const a = n.name.text;
        // this.x = … (yalnız yazma) okuma değildir
        const ust = n.parent;
        const yalnizYazma = ts.isBinaryExpression(ust) && ust.left === n && ust.operatorToken.kind === ts.SyntaxKind.EqualsToken;
        if (yalnizYazma) { ts.forEachChild(n, gez); return; }
        if (ALANLAR[a]) alanlar.add(ALANLAR[a]);
        else cagrilar.add(a);
      }
      ts.forEachChild(n, gez);
    };
    if (!ALANLAR[ad]) ts.forEachChild(m, gez);
    uyeAlan.set(ad, alanlar);
    uyeCagri.set(ad, cagrilar);
  }
  // çağrı zinciri (sabit noktaya kadar)
  let degisti = true;
  while (degisti) {
    degisti = false;
    for (const [ad, cagrilar] of uyeCagri) {
      const al = uyeAlan.get(ad);
      for (const c of cagrilar) {
        if (YAZAN.test(c)) continue;
        for (const k of uyeAlan.get(c) || []) if (!al.has(k)) { al.add(k); degisti = true; }
      }
    }
  }
}

// 2) dosya → doğrudan konular + içe aktarılan dosyalar
const dosyaBilgi = new Map();
function coz(from, spec) {
  if (!spec.startsWith('.')) return null;
  const taban = path.resolve(path.dirname(from), spec);
  for (const e of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const p = taban + e;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}
function bilgi(dosya) {
  if (dosyaBilgi.has(dosya)) return dosyaBilgi.get(dosya);
  const b = { konular: new Set(), ice: new Set() };
  dosyaBilgi.set(dosya, b);
  if (dosya === DS || !/\.(ts|tsx)$/.test(dosya)) return b;
  const sf = kaynak(dosya);
  const gez = (n) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      // yalnız tip içe aktarımı çalışma zamanında bir şey getirmez
      if (!(ts.isImportDeclaration(n) && n.importClause?.isTypeOnly)) {
        const p = coz(dosya, n.moduleSpecifier.text);
        if (p) b.ice.add(p);
      }
    }
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
      const p = coz(dosya, n.arguments[0].text);
      if (p) b.ice.add(p);
    }
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'dataService' && !YAZAN.test(n.name.text)) {
      for (const k of uyeAlan.get(n.name.text) || []) b.konular.add(k);
    }
    ts.forEachChild(n, gez);
  };
  gez(sf);
  return b;
}
export function dosyaKonulari(dosya, gorulen = new Set()) {
  const top = new Set();
  const yigin = [dosya];
  while (yigin.length) {
    const d = yigin.pop();
    if (gorulen.has(d)) continue;
    gorulen.add(d);
    const b = bilgi(d);
    b.konular.forEach((k) => top.add(k));
    b.ice.forEach((i) => yigin.push(i));
  }
  return top;
}

// 3) denetimler
const SAYFA = {
  'sekme:home': null,
  'sekme:students': ['components/Teacher/StudentManagement.tsx', 'StudentManagement'],
  'sekme:homework': ['components/Teacher/HomeworkManagement.tsx', 'HomeworkManagement'],
  'sekme:etuts': ['components/Teacher/EtutManagement.tsx', 'EtutManagement'],
  'sekme:messages': ['components/Teacher/TeacherMessages.tsx', 'TeacherMessages'],
  'sekme:archive': ['components/Teacher/Documents/TeacherDocumentsArchive.tsx', 'TeacherDocumentsArchive'],
  'sekme:grades': ['components/Teacher/DerslerSayfasi.tsx', 'DerslerSayfasi'],
  'sekme:question_tracking': ['components/Teacher/QuestionTrackingView.tsx', 'QuestionTrackingView'],
  'sekme:deneme': ['components/Deneme/DenemeAnalizi.tsx', 'DenemeAnalizi'],
  'sekme:akademik_takvim': ['components/Teacher/AkademikTakvim.tsx', 'AkademikTakvim'],
  'sekme:oyunlar': ['components/Teacher/oyunlar/OyunlarSayfasi.tsx', 'OyunlarSayfasi'],
  'sekme:user_management': ['components/Admin/YonetimSayfasi.tsx', 'YonetimSayfasi'],
  'ana:sistem': ['components/Home/SistemSahibiAnaSayfa.tsx', 'SistemSahibiAnaSayfa'],
  'ana:kurum': ['components/Home/KurumYoneticisiAnaSayfa.tsx', 'KurumYoneticisiAnaSayfa'],
  'ana:mudur': ['components/Home/MudurAnaSayfa.tsx', 'MudurAnaSayfa'],
  'ana:mudur_yrd': ['components/Home/MudurYardimcisiAnaSayfa.tsx', 'MudurYardimcisiAnaSayfa'],
  'ana:rehberlik': ['components/Home/RehberlikAnaSayfa.tsx', 'RehberlikAnaSayfa'],
  'ana:olcme': ['components/Home/OlcmeAnaSayfa.tsx', 'OlcmeAnaSayfa'],
  'ana:etut': ['components/Home/EtutAnaSayfa.tsx', 'EtutAnaSayfa'],
  'ana:ogretmen': ['components/Home/OgretmenAnaSayfa.tsx', 'OgretmenAnaSayfa'],
  ogrenci: ['components/Student/StudentPortal.tsx', 'StudentPortal'],
};
// App'in sayfaya verdiği listeler (App bunları kendi durumunda tutar)
const PROP_KONU = { homeworks: 'odev', submissions: 'teslim', etuts: 'etut', grades: 'not', attendance: 'yoklama', messages: 'mesaj', documents: 'belge', questionLogs: 'soru' };
function appProplari() {
  const sf = kaynak(path.join(SRC, 'App.tsx'));
  const m = new Map();
  const gez = (n) => {
    const acilis = ts.isJsxSelfClosingElement(n) ? n : ts.isJsxElement(n) ? n.openingElement : null;
    if (acilis && ts.isIdentifier(acilis.tagName)) {
      const ad = acilis.tagName.text;
      const k = m.get(ad) || new Set();
      for (const a of acilis.attributes.properties) if (ts.isJsxAttribute(a) && PROP_KONU[a.name.getText(sf)]) k.add(PROP_KONU[a.name.getText(sf)]);
      m.set(ad, k);
    }
    ts.forEachChild(n, gez);
  };
  gez(sf);
  return m;
}
function tabloyuOku() {
  const sf = kaynak(path.join(SRC, 'lib/sayfaKonulari.ts'));
  const t = new Map();
  const gez = (n) => {
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === 'SAYFA_KONULARI' && n.initializer && ts.isObjectLiteralExpression(n.initializer)) {
      for (const p of n.initializer.properties) {
        const ad = ts.isStringLiteral(p.name) ? p.name.text : p.name.getText(sf);
        t.set(ad, new Set(p.initializer.elements.map((e) => e.text)));
      }
    }
    ts.forEachChild(n, gez);
  };
  gez(sf);
  return t;
}
// dosyadaki konu listeli abonelikler: dataService.subscribe(f, [..]) ve useDataVersion([..]) → dosyanın bütün içe
// aktarımları; useVeriSecici([..], () => …) → yalnız seçici işlevin okudukları
function abonelikler(dosya) {
  const sf = kaynak(dosya);
  const cikti = [];
  const yerel = new Map();
  const topla = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name) yerel.set(n.name.text, n);
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) yerel.set(n.name.text, n.initializer);
    ts.forEachChild(n, topla);
  };
  topla(sf);
  const dizi = (d) => (d && ts.isArrayLiteralExpression(d) ? new Set(d.elements.map((e) => e.text)) : undefined);
  const gez = (n) => {
    if (ts.isCallExpression(n)) {
      const ifade = n.expression.getText(sf);
      const satir = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
      if (ifade === 'dataService.subscribe' && n.arguments[1]) cikti.push({ satir, verilen: dizi(n.arguments[1]), gerek: 'dosya' });
      if (ifade === 'useDataVersion' && n.arguments[0]) cikti.push({ satir, verilen: dizi(n.arguments[0]), gerek: 'dosya' });
      if (ifade === 'useVeriSecici') {
        // seçicinin çağırdığı aynı dosyadaki yardımcı işlevler de taranır
        const k = new Set();
        const bakilan = new Set();
        const ic = (m) => {
          if (ts.isPropertyAccessExpression(m) && ts.isIdentifier(m.expression) && m.expression.text === 'dataService' && !YAZAN.test(m.name.text))
            for (const x of uyeAlan.get(m.name.text) || []) k.add(x);
          if (ts.isCallExpression(m) && ts.isIdentifier(m.expression) && yerel.has(m.expression.text) && !bakilan.has(m.expression.text)) {
            bakilan.add(m.expression.text);
            ic(yerel.get(m.expression.text));
          }
          ts.forEachChild(m, ic);
        };
        ic(n.arguments[1]);
        cikti.push({ satir, verilen: dizi(n.arguments[0]), gerek: k });
      }
    }
    ts.forEachChild(n, gez);
  };
  gez(sf);
  return cikti;
}
function tumDosyalar(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) tumDosyalar(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const sirala = (k) => [...k].sort().join(', ') || '—';

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const hatalar = [];
  const tablo = tabloyuOku();
  const proplar = appProplari();
  for (const [anahtar, tanim] of Object.entries(SAYFA)) {
    if (!tablo.has(anahtar)) { hatalar.push(`sayfaKonulari.ts: "${anahtar}" yok`); continue; }
    const gerek = new Set(tanim ? [...dosyaKonulari(path.join(SRC, tanim[0])), ...(proplar.get(tanim[1]) || [])] : []);
    const eksik = [...gerek].filter((k) => !tablo.get(anahtar).has(k));
    if (eksik.length) hatalar.push(`sayfaKonulari.ts "${anahtar}": eksik konu ${eksik.join(', ')} (gereken: ${sirala(gerek)})`);
    if (process.env.AYRINTI) console.log(anahtar.padEnd(26), sirala(gerek));
  }
  for (const a of tablo.keys()) if (!(a in SAYFA)) hatalar.push(`sayfaKonulari.ts: "${a}" denetimde tanımlı değil (scripts/sayfa-konulari.mjs SAYFA)`);
  let abone = 0;
  for (const d of tumDosyalar(SRC)) {
    if (d.endsWith(path.join('lib', 'useDataVersion.ts'))) continue; // kancaların kendisi
    for (const a of abonelikler(d)) {
      abone++;
      const yer = `${path.relative(KOK, d)}:${a.satir}`;
      if (!a.verilen) { hatalar.push(`${yer}: konu listesi dizi olarak yazılmalı`); continue; }
      const gerek = a.gerek === 'dosya' ? dosyaKonulari(d) : a.gerek;
      const eksik = [...gerek].filter((k) => !a.verilen.has(k));
      if (eksik.length) hatalar.push(`${yer}: eksik konu ${eksik.join(', ')} (gereken: ${sirala(gerek)})`);
      if (process.env.AYRINTI) console.log(yer.padEnd(60), sirala(gerek));
    }
  }
  if (hatalar.length) {
    console.error('Veri konusu denetimi DÜŞTÜ:\n  ' + hatalar.join('\n  '));
    process.exit(1);
  }
  console.log(`Veri konusu denetimi geçti (${Object.keys(SAYFA).length} sayfa, ${abone} konulu abonelik).`);
}

export { abonelikler, tumDosyalar };
