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

function toAsciiUpper(s: string) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}
function normalizeSetorForDB(s: string) {
  const t = toAsciiUpper(s);
  if (t.startsWith("ADM")) return "ADM";
  if (t.startsWith("DIREC")) return "Direção";
  if (t.startsWith("FATUR")) return "Faturamento";
  if (t.includes("TELE")) return "Teleatendimento";
  if (t.includes("TECN")) return "Setor Técnico";
  if (t.startsWith("ATEND")) return "Atendimento";
  if (t.startsWith("PROTOC")) return "Protocolo";
  return "ADM";
}
function normalizePapel(p: string) {
  const v = toAsciiUpper(p);
  const ok = ["ADM","DIRETOR","COORDENADOR","OPERADOR","TERCEIRIZADA","VISITANTE"];
  return ok.includes(v) ? v : "VISITANTE";
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")   return json({ error: "Método não permitido." }, 405);

  try {
    // aceita variáveis neutras OU SUPABASE_* que já existam no projeto
    const url =
      Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL")!;
    const anon =
      Deno.env.get("ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const service =
      Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1) quem chama precisa estar autenticado (JWT no header Authorization)
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) return json({ error: "Não autenticado." }, 401);

    // 2) precisa ser ADM no espelho
    const { data: me, error: meErr } = await userClient
      .from("app_users")
      .select("papel")
      .eq("id", user.id)
      .maybeSingle();
    if (meErr) return json({ error: meErr.message }, 500);
    if (!me || String(me.papel).toUpperCase() !== "ADM")
      return json({ error: "Apenas ADM." }, 403);

    // 3) valida payload
    const payload = await req.json();
    const email = String(payload?.email ?? "").trim().toLowerCase();
    const password = String(payload?.password ?? "");
    const nome = String(payload?.nome ?? "").trim() || "Sem Nome";
    const setor = normalizeSetorForDB(String(payload?.setor ?? ""));
    const telefone = (String(payload?.telefone ?? "").trim() || null) as string | null;
    const papel = normalizePapel(String(payload?.papel ?? "VISITANTE"));

    if (!EMAIL_RE.test(email)) return json({ error: "E-mail inválido." }, 400);
    if (password.length < 6)   return json({ error: "Senha deve ter no mínimo 6 caracteres." }, 400);

    // 4) cria usuário via Admin API (Service Role)
    const admin = createClient(url, service, { auth: { persistSession: false } });

    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome, setor, telefone, papel },
    });
    if (cErr) return json({ error: cErr.message }, 400);
    const newUser = created?.user;
    if (!newUser?.id) return json({ error: "Falha ao criar usuário." }, 500);

    // 5) garante espelho em app_users (update-then-insert)
    const up = await admin
      .from("app_users")
      .update({ email, nome, setor, telefone, papel })
      .eq("id", newUser.id)
      .select("id");

    if (up.error) return json({ error: up.error.message }, 500);
    const updatedRows = Array.isArray(up.data) ? up.data.length : 0;

    if (updatedRows === 0) {
      const ins = await admin
        .from("app_users")
        .insert({ id: newUser.id, email, nome, setor, telefone, papel });
      if (ins.error) return json({ error: ins.error.message }, 500);
    }

    return json({ ok: true, user_id: newUser.id, email });
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
}, { onListen: () => console.log("admin-create-user up") });
