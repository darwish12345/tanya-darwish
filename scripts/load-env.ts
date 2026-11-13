// Muatkan .env.local untuk skrip terminal (Next.js memuatkannya secara automatik untuk app)
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
