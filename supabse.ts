// src/supabase.ts
import { createClient } from '@supabase/supabase-js';

// Substitua com os dados do seu projeto Supabase
const supabaseUrl = 'https://xyzcompany.supabase.co'; // Substitua com a URL do seu projeto Supabase
const supabaseKey = 'public-anon-key'; // Substitua com a chave pública de seu projeto

// Criação do cliente Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;
