// ============================================================================
// AŞAMA 171 — ADDAN CİNSİYET TAHMİNİ
// Yaygın Türkçe adlardan kız/kadın ('K') veya erkek ('E') tahmini yapar.
// İki cinsiyette de kullanılan adlar (Deniz, Umut, Ekin…) ve listede olmayan adlar
// için tahmin YAPILMAZ (boş döner) — yanlış atamaktansa boş bırakmak daha güvenlidir.
// Bu dosya yalnız yönetim/öğrenci ekranlarında, gerektiğinde (lazy import) yüklenir.
// ============================================================================

const KIZ =
  'ayse fatma zeynep elif emine hatice meryem merve esra busra kubra sumeyye rabia hilal ' +
  'ebru ozlem gamze tugba seda sevgi derya dilek gul gulsah gulsum gulsen gulay gulbahar gulten gulizar ' +
  'nur nuray nurten nurcan nurhan nursel nurgul nurdan nuriye nurhayat nermin nesrin neslihan nihal nilay nilufer nil ' +
  'aylin ayla aynur aysel aysun ayten aydan aygul aysegul ayca aysenur aylin aysu ayda ayperi aybuke aysima aynaz ' +
  'buse beyza berra berfin beril berna berrin betul bahar banu basak belgin bengu berivan beren berre bilge birgul burcu burcin ' +
  'cansu cemre ceren cigdem canan cennet ceylan cagla cansel ' +
  'damla defne dilara dilan dilay dicle didem dilsad duygu dudu durdane derin dila doga ' +
  'eda ela elcin elvan emel emine esin esma eylul ezgi ece ecrin ekin-k elif elifnur elanur esila eslem esmanur ebrar ' +
  'feyza filiz fadime fatmanur ferda feride fidan figen funda fulya fusun fikriye fatima ' +
  'gizem gonul gulnur gulru guler gulcan gulce gunes-k guzide gokce gozde ' +
  'hacer hafize halime hande hanife hanim havva hayriye hulya humeyra hurriyet hazal helin hiranur hira hiba havin hayal hacer ' +
  'ilayda ipek irem isil iclal ilknur ilkay-k imren inci ikra ' +
  'kader kadriye kevser kezban kiraz kumru kardelen kubranur ' +
  'lale latife leman leyla lutfiye lina ' +
  'melek melike melis meltem mine mehtap melisa merve meryem mukaddes munevver muge mujgan medine mihriban miray mira mirac-k ' +
  'nazli nazan naz nazife necla nejla nergis neriman nevin nesibe nisa nisanur nehir nesrin nida nefise ' +
  'oya oznur ozge ozden ozgul oykum oyku ozlem ' +
  'pelin pinar perihan pakize pembe ' +
  'rukiye reyhan rana ruya ruveyda rumeysa rojda ravza ' +
  'saadet sabiha sabriye safiye sakine saliha selma selin semra serap serpil sevda sevil sevim sevinc seyma sibel simge sinem songul sultan sukran sule sadiye serife sema semiha serra sena senanur sudenaz sude sila sima solmaz sumeyra suna suzan sebnem sermin ' +
  'tuba tugce tulay tulin tuna-k tuncay-k turkan tansu tugba ' +
  'ulku umran-k usame-k ummu ummugulsum ' +
  'vildan vesile veliye ' +
  'yasemin yeliz yesim yildiz yonca yagmur yaren yeter yurdagul ' +
  'zehra zeliha zerrin zuhal zubeyde zumrut zeynepnur zulal zuleyha zulfiye zeren ' +
  'asli asya aleyna ahsen azra alara almila arya-k asel aden ada ilkim ilgin irmak-k ' +
  'nisa nilsu nazlican mina meva erva elisa eliz elvin ilay ilsu eslem iclal hamide hatun hayrunnisa hamiyet huriye';

const ERKEK =
  'ahmet mehmet mustafa ali huseyin hasan ibrahim ismail osman yusuf murat omer ramazan halil suleyman abdullah mahmut ' +
  'recep salih kemal hakan kadir orhan fatih adem emre burak serkan yasin ercan erkan erdem eren enes emir efe ege ' +
  'abdulkadir abdurrahman abdulsamet abdulbaki adnan akif alparslan alper alpay alptekin altan anil arda arif aras arslan atakan ataberk ' +
  'atilla aydin ayhan aykut baki baris batuhan battal bayram bekir berat berkay berk berkan bilal bulent burhan bora bugra baran berkant ' +
  'can cem cemal cengiz cenk cevdet cihan cuneyt celal cafer caner cemil coskun cagri cagatay cetin ' +
  'davut dogan dogukan durmus dursun dursunali duran dervis deniz-e ' +
  'ekrem emin engin enver ergun erhan erol ersin ertan ertugrul esat eyup ensar emrullah emirhan efehan egemen erdal ercument erdogan ' +
  'faruk fahri fikret ferhat feridun fevzi furkan fuat ferit fethi ' +
  'gokhan gurkan guven gokay gokberk gokmen goktug gursel ' +
  'hamza hamdi harun haydar hikmet hilmi hulusi husamettin hayati hayrettin hakki halit hidayet hasret-e ' +
  'ilhan ilker irfan ismet izzet ihsan ilyas iskender ' +
  'kaan kamil kenan kerem kazim koray kubilay kutay kursat kudret ' +
  'levent lutfi ' +
  'mert metin muhammed muhammet muhittin musa muzaffer mesut mehmetali mithat mucahit murathan mirza mikail miran ' +
  'nihat nazim necati necdet nevzat nuri nusret nail namik nedim nurettin nurullah ' +
  'oguz oguzhan okan oktay onur orkun osman ozan ozkan ozgur ozcan ' +
  'polat ' +
  'rasim rauf rafet resat riza ridvan rifat rustem ruhi ' +
  'sadettin sadik said sait selahattin selim semih sencer serdar sefa serhat sinan sami samet savas sedat selcuk seyit sabri sahin sukru sefik sevket seref sener semsettin suat taha ' +
  'talha tamer taner tarik tayfun tayyip tekin tevfik tolga toprak tuncer turan turgay turgut tugrul tunahan ' +
  'ufuk ugur umit-e unal utku umutcan ' +
  'vahit vedat veli volkan vural ' +
  'yakup yalcin yavuz yasar yilmaz yunus yusuf yuksel yigit yagiz yasin yahya ' +
  'zafer zeki zekeriya ziya zubeyir ' +
  'alihan alikaan aliriza ahmetcan baturalp batu kayra-e kerim mirac-e miraç-e nurhan-e poyraz rüzgar-e salim selman seyfettin tuna-e uygar yigitcan';

// İki cinsiyette de yaygın: tahmin yapılmaz
const IKISI =
  'deniz umut ekin evren arya ilkay irmak gunes tuna tuncay mirac nurhan sezgin sezer yuksel-x ozgur-x aydin-x ' +
  'hasret kayra derya-x umran usame cihan-x eylem ozden-x sevgi-x bilge-x';

const fold = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/[âà]/g, 'a')
    .replace(/[îì]/g, 'i')
    .replace(/[ûù]/g, 'u')
    .replace(/[^a-z]/g, '');

let map: Map<string, 'K' | 'E'> | null = null;
function build(): Map<string, 'K' | 'E'> {
  const m = new Map<string, 'K' | 'E'>();
  const unisex = new Set(
    IKISI.split(/\s+/)
      .filter((w) => w && !w.endsWith('-x'))
      .map(fold)
  );
  const add = (list: string, g: 'K' | 'E') => {
    for (const raw of list.split(/\s+/)) {
      if (!raw || /-[a-z]$/.test(raw)) continue; // "-k/-e" işaretliler belirsiz kabul edilir
      const k = fold(raw);
      if (!k || unisex.has(k)) continue;
      const prev = m.get(k);
      if (prev && prev !== g) {
        unisex.add(k);
        m.delete(k);
        continue;
      }
      m.set(k, g);
    }
  };
  add(KIZ, 'K');
  add(ERKEK, 'E');
  return m;
}

/** Tek bir addan tahmin (ilk ad; bilinmezse ikinci ad). Bilinmiyorsa undefined. */
export function cinsiyetTahmin(fullName: string): 'K' | 'E' | undefined {
  if (!map) map = build();
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  // Soyadı (son kelime) hariç ilk iki ada bakılır
  const adlar = parts.length > 1 ? parts.slice(0, Math.min(2, parts.length - 1)) : parts;
  for (const a of adlar) {
    const g = map.get(fold(a));
    if (g) return g;
  }
  return undefined;
}

export const cinsiyetEtiketi = (g: 'K' | 'E' | undefined, kind: 'student' | 'teacher') =>
  g === 'K' ? (kind === 'student' ? 'Kız' : 'Kadın') : g === 'E' ? 'Erkek' : '';
