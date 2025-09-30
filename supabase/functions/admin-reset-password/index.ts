// supabase/functions/admin-reset-password/index.ts
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")   return json({ error: "Método não permitido." }, 405);

  try {
    // Aceita variáveis neutras OU SUPABASE_* existentes
    const url =
      Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL");
    const anon =
      Deno.env.get("ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
    const service =
      Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !anon || !service) {
      return json({ error: "Ambiente faltando URL/ANON/SERVICE. Confira com `supabase secrets list`." }, 500);
    }

    // 1) Auth do chamador (precisa vir com bearer token)
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Authorization Bearer token ausente." }, 401);
    }

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr)  return json({ error: `Falha ao validar sessão: ${uErr.message}` }, 401);
    if (!user) return json({ error: "Não autenticado." }, 401);

    // 2) Tem que ser ADM no espelho
    const { data: me, error: meErr } = await userClient
      .from("app_users")
      .select("papel")
      .eq("id", user.id)
      .maybeSingle();
    if (meErr) return json({ error: `Falha ao ler app_users: ${meErr.message}` }, 500);
    if (!me || String(me.papel).toUpperCase() !== "ADM") {
      return json({ error: "Apenas ADM." }, 403);
    }

    // 3) Payload
    let payload: any = null;
    try { payload = await req.json(); } catch { return json({ error: "Body inválido (JSON)." }, 400); }
    const { user_id, new_password } = payload || {};
    if (!user_id || !new_password || String(new_password).length < 6) {
      return json({ error: "user_id e new_password (>=6) são obrigatórios." }, 400);
    }

    // 4) Troca de senha (Service Role)
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: updErr } = await admin.auth.admin.updateUserById(user_id, { password: new_password });
    if (updErr) return json({ error: `Admin API: ${updErr.message}` }, 400);

    return json({ ok: true });
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
}, { onListen: () => console.log("admin-reset-password up") });
