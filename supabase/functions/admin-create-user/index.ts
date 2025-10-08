// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------- CORS ----------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j200 = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
const ok = (data: Record<string, unknown> = {}) => j200({ ok: true, ...data });
const fail = (error: string, error_code = "ERROR", extra: Record<string, unknown> = {}) =>
  j200({ ok: false, error, error_code, ...extra });

// ---------- Helpers ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const toAsciiUpper = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

function normalizeSetorForDB(s: string) {
  const t = toAsciiUpper(s);
  if (t.startsWith("ADM")) return "ADM";
  if (t.startsWith("DIREC")) return "Direção";
  if (t.startsWith("FATUR")) return "Faturamento";
  if (t.includes("TELE"))   return "Teleatendimento";
  if (t.includes("TECN"))   return "Setor Técnico";
  if (t.startsWith("ATEND")) return "Atendimento";
  if (t.startsWith("PROTOC")) return "Protocolo";
  return "ADM";
}
function normalizePapel(p: string) {
  const v = toAsciiUpper(p);
  const ok = ["ADM","DIRETOR","COORDENADOR","OPERADOR","TERCEIRIZADA","VISITANTE"];
  return ok.includes(v) ? v : "VISITANTE";
}
function mapCreateUserErr(e: any) {
  const msg = String(e?.message || e);
  const low = msg.toLowerCase();
  if (low.includes("already registered") || low.includes("already exists") || low.includes("duplicate")) {
    return { error: "E-mail já cadastrado.", error_code: "EMAIL_DUPLICATE" };
  }
  if (low.includes("password")) {
    return { error: "Senha deve ter no mínimo 6 caracteres.", error_code: "PASSWORD_TOO_SHORT" };
  }
  if (low.includes("invalid api key") || low.includes("service_role")) {
    return { error: "SERVICE_ROLE inválida/não configurada.", error_code: "SERVICE_ROLE_INVALID" };
  }
  return { error: msg, error_code: "CREATE_USER_ERROR" };
}

// ---------- Function ----------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST")    return fail("Método não permitido.", "METHOD_NOT_ALLOWED");

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE) {
      return fail(
        "Faltam secrets na Edge Function. Defina SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.",
        "MISSING_SECRETS"
      );
    }

    // 1) Autenticação de quem chama
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return fail("Não autenticado.", "NO_AUTH");

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) return fail("Não autenticado.", "AUTH_GETUSER_FAILED");

    // 2) Autorização: ADM no app_users OU linha em app_admins
    let hasAdmin = false;
    try {
      const [{ data: me }, { data: isAdmRow }] = await Promise.all([
        userClient.from("app_users").select("papel").eq("id", user.id).maybeSingle(),
        userClient.from("app_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
      ]);
      const papel = String(me?.papel ?? "").toUpperCase();
      hasAdmin = papel === "ADM" || !!isAdmRow;
    } catch { /* se der erro de select, mantém false */ }
    if (!hasAdmin) return fail("Apenas ADM.", "NOT_ADMIN");

    // 3) Payload
    let body: any;
    try { body = await req.json(); } catch { return fail("JSON inválido.", "BAD_JSON"); }

    const email    = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const nome     = (String(body?.nome ?? "").trim() || "Sem Nome").slice(0, 200);
    const setor    = normalizeSetorForDB(String(body?.setor ?? ""));
    const telefone = (String(body?.telefone ?? "").trim() || null) as string | null;
    const papelNew = normalizePapel(String(body?.papel ?? "VISITANTE"));

    if (!EMAIL_RE.test(email))   return fail("E-mail inválido.", "EMAIL_INVALID");
    if (password.length < 6)     return fail("Senha deve ter no mínimo 6 caracteres.", "PASSWORD_TOO_SHORT");

    // 4) Admin API — cria usuário
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome, setor, telefone, papel: papelNew },
    });
    if (cErr) {
      const mapped = mapCreateUserErr(cErr);
      return fail(mapped.error, mapped.error_code);
    }
    const newUser = created?.user;
    if (!newUser?.id) return fail("Falha ao criar usuário (sem ID retornado).", "NO_USER_ID");

    // 5) Espelha no app_users — UPSERT com fallback
    const payloadFull: any = { id: newUser.id, email, nome, setor, telefone, papel: papelNew };
    const up1 = await admin.from("app_users").upsert(payloadFull, { onConflict: "id" });
    if (up1.error) {
      const payloadMin: any = { id: newUser.id, email, nome, setor };
      const up2 = await admin.from("app_users").upsert(payloadMin, { onConflict: "id" });
      if (up2.error) return fail(up2.error.message, "UPSERT_FAIL");
    }

    return ok({ user_id: newUser.id, email });
  } catch (e: any) {
    console.error("admin-create-user UNEXPECTED:", e);
    return fail(e?.message ?? String(e), "UNEXPECTED");
  }
});
