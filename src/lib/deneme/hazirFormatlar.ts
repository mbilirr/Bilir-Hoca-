// ============================================================================
// Aşama 335: HAZIR OPTİK FORMATLARI (5-6-7 ve LGS)
// Mustafa'nın verdiği 160 TXT ve 11 FMT ile çıkarıldı; her TXT bunlardan yalnız BİRİNE temiz uyar.
// Aşama 336: Sinan Kuzucu (A-B-C-D kitapçık) formatları eklendi.
// Kurumun kayıtlı formatlarından sonra denenir; uymazsa FMT'siz okuma (optikOtomatik) devreye girer.
// Hazır format düzenlenemez/silinemez; düzenlenirse kuruma yeni format olarak kaydedilir.
// Kurum optiğinin "Değerler" kutuları BİLEREK yok (dersleri bilinmiyor; bkz. KURULUM-335).
// ============================================================================
import type { DenemeFormat } from '../../services/denemeService';
import type { FieldRole, OptikField } from './optik';

type Alan = [start: number, width: number, role: FieldRole, subject: string | null, label: string];
interface Tanim {
  id: string;
  name: string;
  /** TXT satır uzunluğu (uyum denetimi bunu bekler) */
  len: number;
  alanlar: Alan[];
}

const TANIMLAR: Tanim[] = [
  {
    id: 'hazir:sekonik162',
    name: 'Sekonik 162 (hazırbulunuşluk, Sınav, Palme, Vites sözel 1, tarama)',
    len: 162,
    alanlar: [
      [4, 1, 'booklet', null, 'Kitapçık'],
      [5, 6, 'number', null, 'Öğrenci no'],
      [11, 11, 'tc', null, 'TC'],
      [22, 1, 'grade', null, 'Sınıf'],
      [23, 1, 'section', null, 'Şube'],
      [24, 19, 'fullname', null, 'Ad soyad'],
      [43, 20, 'answers', 'tr', 'Türkçe'],
      [63, 20, 'answers', 'sos', 'Sosyal / İnkılap'],
      [83, 20, 'answers', 'din', 'Din kültürü'],
      [103, 20, 'answers', 'ing', 'İngilizce'],
      [123, 20, 'answers', 'mat', 'Matematik'],
      [143, 20, 'answers', 'fen', 'Fen bilimleri'],
    ],
  },
  {
    id: 'hazir:hiz167',
    name: 'Hız Yayınları 167',
    len: 167,
    alanlar: [
      [9, 11, 'tc', null, 'TC'],
      [20, 5, 'number', null, 'Öğrenci no'],
      [26, 1, 'booklet', null, 'Kitapçık'],
      [27, 19, 'fullname', null, 'Ad soyad'],
      [46, 1, 'grade', null, 'Sınıf'],
      [47, 1, 'section', null, 'Şube'],
      [48, 20, 'answers', 'tr', 'Türkçe'],
      [68, 20, 'answers', 'sos', 'Sosyal / İnkılap'],
      [88, 20, 'answers', 'din', 'Din kültürü'],
      [108, 20, 'answers', 'ing', 'İngilizce'],
      [128, 20, 'answers', 'mat', 'Matematik'],
      [148, 20, 'answers', 'fen', 'Fen bilimleri'],
    ],
  },
  {
    id: 'hazir:ari140',
    name: 'Arı Yayınları 140',
    len: 140,
    alanlar: [
      [9, 5, 'number', null, 'Öğrenci no'],
      [14, 22, 'fullname', null, 'Ad soyad'],
      [36, 11, 'tc', null, 'TC'],
      [48, 1, 'grade', null, 'Sınıf'],
      [49, 1, 'section', null, 'Şube'],
      [50, 1, 'booklet', null, 'Kitapçık'],
      [51, 20, 'answers', 'tr', 'Türkçe'],
      [71, 10, 'answers', 'sos', 'Sosyal / İnkılap'],
      [81, 10, 'answers', 'din', 'Din kültürü'],
      [91, 10, 'answers', 'ing', 'İngilizce'],
      [101, 20, 'answers', 'mat', 'Matematik'],
      [121, 20, 'answers', 'fen', 'Fen bilimleri'],
    ],
  },
  {
    id: 'hazir:bes280',
    name: 'BES / Ulti 280',
    len: 280,
    alanlar: [
      [10, 5, 'number', null, 'Öğrenci no'],
      [15, 20, 'fullname', null, 'Ad soyad'],
      [35, 11, 'tc', null, 'TC'],
      [57, 1, 'grade', null, 'Sınıf'],
      [58, 1, 'section', null, 'Şube'],
      [60, 1, 'booklet', null, 'Kitapçık'],
      [161, 20, 'answers', 'tr', 'Türkçe'],
      [181, 20, 'answers', 'sos', 'Sosyal / İnkılap'],
      [201, 20, 'answers', 'din', 'Din kültürü'],
      [221, 20, 'answers', 'ing', 'İngilizce'],
      [241, 20, 'answers', 'mat', 'Matematik'],
      [261, 20, 'answers', 'fen', 'Fen bilimleri'],
    ],
  },
  {
    id: 'hazir:isabet240',
    name: 'Kurum optiği 240 (Genel / Merkezî sınav)',
    len: 240,
    alanlar: [
      [4, 11, 'tc', null, 'TC'],
      [21, 5, 'number', null, 'Öğrenci no'],
      [27, 1, 'grade', null, 'Sınıf'],
      [29, 1, 'section', null, 'Şube'],
      [31, 1, 'booklet', null, 'Kitapçık'],
      [33, 18, 'fullname', null, 'Ad soyad'],
      [52, 20, 'answers', 'tr', 'Türkçe'],
      [73, 20, 'answers', 'sos', 'Sosyal / İnkılap'],
      [94, 20, 'answers', 'din', 'Din kültürü'],
      [115, 20, 'answers', 'ing', 'İngilizce'],
      [136, 20, 'answers', 'mat', 'Matematik'],
      [157, 20, 'answers', 'fen', 'Fen bilimleri'],
    ],
  },
  {
    id: 'hazir:kuzucu-sayisal',
    name: 'Sinan Kuzucu sayısal 91 (A-B-C-D kitapçık)',
    len: 91,
    alanlar: [
      [10, 5, 'number', null, 'ÖGR No'],
      [15, 11, 'tc', null, 'TC No'],
      [28, 1, 'booklet', null, 'Kitapçık Türü'],
      [30, 22, 'fullname', null, 'Ad Soyad'],
      [52, 20, 'answers', 'mat', 'MAT'],
      [72, 20, 'answers', 'fen', 'FEN'],
    ],
  },
  {
    id: 'hazir:kuzucu-sozel',
    name: 'Sinan Kuzucu sözel 131 (A-B-C-D kitapçık)',
    len: 131,
    alanlar: [
      [10, 5, 'number', null, 'ÖGR No'],
      [15, 11, 'tc', null, 'TC No'],
      [28, 1, 'booklet', null, 'Kitapçık Türü'],
      [30, 22, 'fullname', null, 'Ad Soyad'],
      [52, 20, 'answers', 'tr', 'Türkçe'],
      [72, 20, 'answers', 'din', 'Din-Ahlak'],
      [92, 20, 'answers', 'sos', 'Sosyal'],
      [112, 20, 'answers', 'ing', 'Y.Dil'],
    ],
  },
  {
    id: 'hazir:oky67108',
    name: 'OKY 5-6-7-LGS (67108) Sekonic 171',
    len: 171,
    alanlar: [
      [11, 5, 'number', null, 'ÖĞRENCİ NO'],
      [16, 10, 'name', null, 'ADI'],
      [26, 10, 'surname', null, 'SOYADI'],
      [36, 1, 'grade', null, 'SINIF'],
      [37, 1, 'section', null, 'ŞUBE'],
      [51, 1, 'booklet', null, 'KİTAPÇIK TÜRÜ'],
      [52, 20, 'answers', 'tr', 'TÜRKÇE'],
      [72, 20, 'answers', 'sos', 'SOSYAL'],
      [92, 20, 'answers', 'din', 'DİN'],
      [112, 20, 'answers', 'ing', 'İNGİLİZCE'],
      [132, 20, 'answers', 'mat', 'MATEMATİK'],
      [152, 20, 'answers', 'fen', 'FEN'],
    ],
  },
  {
    id: 'hazir:vts-sayisal',
    name: 'Yanıt VTS 5-8 sayısal 58',
    len: 58,
    alanlar: [
      [1, 14, 'fullname', null, 'ADI SOYADI'],
      [15, 1, 'grade', null, 'SINIF'],
      [16, 1, 'section', null, 'ŞUBE'],
      [17, 11, 'tc', null, 'TC NO'],
      [28, 5, 'number', null, 'ÖĞRENCİ NO'],
      [35, 12, 'answers', 'mat', 'MATEMATİK'],
      [47, 12, 'answers', 'fen', 'FEN'],
    ],
  },
  {
    id: 'hazir:vts-sozel',
    name: 'Yanıt VTS 5-8 sözel 82',
    len: 82,
    alanlar: [
      [1, 14, 'fullname', null, 'ADI SOYADI'],
      [15, 1, 'grade', null, 'SINIF'],
      [16, 1, 'section', null, 'ŞUBE'],
      [17, 11, 'tc', null, 'TC NO'],
      [28, 5, 'number', null, 'ÖĞRENCİ NO'],
      [35, 12, 'answers', 'tr', 'TÜRKÇE'],
      [47, 12, 'answers', 'sos', 'İNKILAP'],
      [59, 12, 'answers', 'din', 'DİN'],
      [71, 12, 'answers', 'ing', 'İNGİLİZCE'],
    ],
  },
  {
    id: 'hazir:workwin150',
    name: 'Workwin ortaokul 4-8 150 (bursluluk)',
    len: 150,
    alanlar: [
      [1, 11, 'tc', null, 'TC'],
      [12, 5, 'number', null, 'OgrNO'],
      [17, 1, 'booklet', null, 'Ktürü'],
      [18, 1, 'grade', null, 'Sınıf'],
      [19, 1, 'section', null, 'şube'],
      [20, 20, 'fullname', null, 'ADISOYADI'],
      [40, 20, 'answers', 'tr', 'TÜRKÇE20'],
      [60, 10, 'answers', 'sos', 'sosyal10'],
      [70, 10, 'answers', 'din', 'din10'],
      [80, 10, 'answers', 'ing', 'ydil10'],
      [90, 20, 'answers', 'mat', 'mat20'],
      [110, 20, 'answers', 'fen', 'fen20'],
    ],
  },
  {
    id: 'hazir:ynt167',
    name: 'YNT orta 4-8 Sekonic 167 (MUBA)',
    len: 167,
    alanlar: [
      [18, 6, 'number', null, 'ÖĞRENCİ  NO'],
      [24, 20, 'fullname', null, 'AD-SOYAD'],
      [44, 1, 'grade', null, 'SINIF'],
      [45, 1, 'section', null, 'ŞUBE'],
      [47, 1, 'booklet', null, 'KİT'],
      [48, 20, 'answers', 'tr', 'TÜRKÇE-ORTA'],
      [68, 20, 'answers', 'sos', 'İNKILAP-ORTA'],
      [88, 20, 'answers', 'din', 'DİN-ORTA'],
      [108, 20, 'answers', 'ing', 'YABANCI DİL-ORTA'],
      [128, 20, 'answers', 'mat', 'MATEMATİK-ORTA'],
      [148, 20, 'answers', 'fen', 'FEN BİLİMLERİ-ORTA'],
    ],
  },
  {
    id: 'hazir:okyanus274',
    name: 'Okyanus / Newton 5-8 274',
    len: 274,
    alanlar: [
      [1, 11, 'tc', null, 'TC Kimlik'],
      [13, 5, 'number', null, 'Numarası'],
      [26, 1, 'booklet', null, 'Kitapçık Türü'],
      [28, 1, 'grade', null, 'Sınıfı'],
      [29, 1, 'section', null, 'Derslik'],
      [38, 10, 'name', null, 'Adı'],
      [49, 14, 'surname', null, 'Soyadı'],
      [88, 20, 'answers', 'tr', 'Türkçe'],
      [119, 10, 'answers', 'sos', 'Sosyal Bilgiler'],
      [150, 10, 'answers', 'din', 'Din Kültürü'],
      [181, 10, 'answers', 'ing', 'İngilizce'],
      [212, 20, 'answers', 'mat', 'Matematik'],
      [243, 20, 'answers', 'fen', 'Fen ve Teknoloji'],
    ],
  },
  {
    id: 'hazir:fenomen180',
    name: 'Fenomen 5-8 180',
    len: 180,
    alanlar: [
      [1, 20, 'fullname', null, 'SOYADI ADI'],
      [21, 11, 'tc', null, 'TC'],
      [40, 5, 'number', null, 'numara'],
      [57, 1, 'grade', null, 'SINIF'],
      [58, 1, 'section', null, 'ŞUBE'],
      [60, 20, 'answers', 'tr', 'TÜRKÇE'],
      [80, 20, 'answers', 'sos', 'SOSYAL INK'],
      [100, 20, 'answers', 'din', 'DİN'],
      [120, 20, 'answers', 'ing', 'İNG'],
      [140, 20, 'answers', 'mat', 'MAT'],
      [160, 20, 'answers', 'fen', 'FEN'],
    ],
  },
  {
    id: 'hazir:optik105',
    name: 'OPTIK-105 2-7. sınıf 230',
    len: 230,
    alanlar: [
      [4, 5, 'number', null, 'OGRNO'],
      [9, 10, 'name', null, 'ADI'],
      [19, 9, 'surname', null, 'SOYADI'],
      [28, 1, 'grade', null, 'SINIF'],
      [29, 1, 'section', null, 'SUBE'],
      [39, 11, 'tc', null, 'TCNO'],
      [50, 1, 'booklet', null, 'KITAPCIK'],
      [111, 20, 'answers', 'tr', 'TUR'],
      [131, 20, 'answers', 'mat', 'MAT'],
      [151, 20, 'answers', 'fen', 'FEN'],
      [171, 20, 'answers', 'sos', 'SOS'],
      [191, 20, 'answers', 'ing', 'ING'],
      [211, 20, 'answers', 'din', 'DIN'],
    ],
  },
];

const HAZIR_ON = 'hazir:';

export const hazirMi = (id: string | null | undefined): boolean => !!id && id.startsWith(HAZIR_ON);

/** Alanlar arasındaki boşluklar "kullanılmaz" alanla doldurulur (format satırı baştan sona tarif etsin) */
function alanlariKur(t: Tanim): OptikField[] {
  const out: OptikField[] = [];
  let pos = 1;
  const bosluk = (start: number, width: number) => out.push({ id: `${t.id}:${start}`, label: 'Boşluk', role: 'ignore', start, width });
  for (const [start, width, role, subject, label] of t.alanlar) {
    if (start > pos) bosluk(pos, start - pos);
    out.push({ id: `${t.id}:${start}`, label, role, ...(subject ? { subject } : {}), start, width });
    pos = start + width;
  }
  if (pos <= t.len) bosluk(pos, t.len - pos + 1);
  return out;
}

export const HAZIR_FORMATLAR: DenemeFormat[] = TANIMLAR.map((t) => ({
  id: t.id,
  kurumId: null,
  name: `Hazır · ${t.name}`,
  fmtText: '',
  fields: alanlariKur(t),
}));
