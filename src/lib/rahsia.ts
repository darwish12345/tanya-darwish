/**
 * AGENT_SECRET melindungi endpoint dalaman (webhook Telegram, cron, setup).
 * Tanpanya, sesiapa yang tahu URL boleh menghantar arahan palsu kepada agent.
 */
export function rahsiaSah(nilai: string | null | undefined): boolean {
  const rahsia = process.env.AGENT_SECRET;
  if (!rahsia || rahsia.length < 16) return false; // wajib ditetapkan, minimum 16 aksara
  return nilai === rahsia;
}
