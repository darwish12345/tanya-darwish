/**
 * BUTANG SOALAN LAPISAN PERTAMA (dipaparkan semasa chat dibuka).
 * "label" = teks pada butang, "soalan" = mesej sebenar yang dihantar kepada agent.
 * "isi" (pilihan) = butang TIDAK terus menghantar; ia mengisi kotak mesej supaya pelawat boleh
 *   menampal sesuatu dahulu (contoh job description).
 * Maksimum 6 disyorkan: setiap butang mewakili satu sebab recruiter datang ke laman ini.
 */
export type SoalanPembuka = { label: string; soalan: string; isi?: boolean };

export const SOALAN_PEMBUKA: SoalanPembuka[] = [
  { label: "Kenali Darwish", soalan: "Ceritakan tentang Darwish dalam 30 saat." },
  { label: "Projek & repo GitHub", soalan: "Tunjukkan projek dan repo GitHub Darwish." },
  { label: "Kemahiran teknikal", soalan: "Apa tech stack dan kemahiran utama Darwish?" },
  { label: "Sijil", soalan: "Apa sijil profesional yang Darwish ada?" },
  { label: "Semak padanan jawatan", soalan: "Sejauh mana Darwish sesuai untuk jawatan ini?\n\n[Tampal job description di sini]", isi: true },
  { label: "Tempah interview", soalan: "Saya nak tempah slot interview dengan Darwish." },
];
