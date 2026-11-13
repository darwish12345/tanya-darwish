import type { Metadata } from "next";
import Link from "next/link";
import Statistik from "@/components/Statistik";

export const metadata: Metadata = {
  title: "Statistik | Tanya Darwish",
  description: "Angka penggunaan dan kualiti agent AI Tanya Darwish (tanpa data peribadi).",
};

export default function HalamanStatistik() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-5 py-10">
      <div className="space-y-2">
        <Link href="/" className="text-sm text-indigo-600 hover:underline">
          ← Kembali ke chat
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Statistik agent</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Bagaimana agent ini digunakan dan sejauh mana ia boleh dipercayai, 30 hari terakhir. Tiada teks soalan, nama atau
          emel dipaparkan.
        </p>
      </div>
      <Statistik />
    </main>
  );
}
