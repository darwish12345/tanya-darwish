/** Alamat utama laman (untuk webhook, QStash dan pautan). */
export function laman(): string {
  return (process.env.LAMAN_URL || process.env.URL || "https://tanya-darwish.netlify.app").replace(/\/$/, "");
}
