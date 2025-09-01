import { createClient } from "@supabase/supabase-js";

// 🔑 Troque pelos seus valores (já coloquei os que você mandou)
const supabaseUrl = "https://lgnaejzkwandwpwohcnw.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnbmFlanprd2FuZHdwd29oY253Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU2Mjg5OTgsImV4cCI6MjA3MTIwNDk5OH0.NkNmm11W6IJvatUNyI-WrSVggoo5OrIkA9O53lqNAhc";

// 🔥 Instância do supabase que será usada no app inteiro
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
