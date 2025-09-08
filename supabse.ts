// src/supabase.ts
import { createClient } from "@supabase/supabase-js";

// ⚙️ Puxe de variáveis de ambiente (recomendado)
const supabaseUrl = (import.meta as any)?.env?.VITE_SUPABASE_URL as string;
const supabaseKey = (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY as string;

// storage "nulo" para garantir que nada seja salvo no navegador
const voidStorage = {
  getItem: (_key: string) => null,
  setItem: (_key: string, _val: string) => {},
  removeItem: (_key: string) => {},
};

// Cliente Supabase SEM persistir sessão (nem localStorage, nem cookies)
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,   // não guarda sessão
    autoRefreshToken: false, // não renova token
    detectSessionInUrl: true,
    storage: voidStorage,    // impede qualquer fallback em storage
  },
});

export default supabase;
