import { createClient } from "@supabase/supabase-js";

// Vite: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em .env.local
const supabaseUrl =
  (import.meta as any).env?.VITE_SUPABASE_URL ||
  "https://lgnaejzkwandwpwohcnw.supabase.co";

const supabaseAnonKey =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnbmFlanprd2FuZHdwd29oY253Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU2Mjg5OTgsImV4cCI6MjA3MTIwNDk5OH0.NkNmm11W6IJvatUNyI-WrSVggoo5OrIkA9O53lqNAhc";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export { supabase };
export default supabase;
