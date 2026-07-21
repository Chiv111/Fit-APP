import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function readDefaultKey(jsonName: string, legacyName: string) {
  const encoded = Deno.env.get(jsonName);
  if (encoded) {
    try {
      const values = JSON.parse(encoded) as Record<string, unknown>;
      const candidate = values.default || Object.values(values)[0];
      if (typeof candidate === "string") return candidate;
      if (candidate && typeof candidate === "object") {
        const nested = candidate as Record<string, unknown>;
        if (typeof nested.key === "string") return nested.key;
        if (typeof nested.value === "string") return nested.value;
      }
    } catch {
      // Use the legacy key below when the modern key set is unavailable.
    }
  }
  return Deno.env.get(legacyName) || "";
}

function allowedAdminEmails() {
  return new Set(
    (Deno.env.get("INVITE_ADMIN_EMAILS") || "sebastianrdzj@gmail.com")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function inviteRedirectUrl() {
  const configured = Deno.env.get("ANVIL_APP_URL") || "https://fit-app-lac.vercel.app/";
  const url = new URL(configured);
  url.searchParams.set("invite", "1");
  return url.toString();
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ message: "Método no permitido." }, 405);

  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return jsonResponse({ message: "Inicia sesión para enviar invitaciones." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const secretKey = readDefaultKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !secretKey) {
    console.error("invite-user: Supabase server credentials are unavailable");
    return jsonResponse({ message: "El servicio de invitaciones no está configurado." }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  const inviter = userData?.user;
  const inviterEmail = String(inviter?.email || "").trim().toLowerCase();

  if (userError || !inviter) return jsonResponse({ message: "Tu sesión ya no es válida. Vuelve a entrar." }, 401);
  if (!allowedAdminEmails().has(inviterEmail)) {
    console.warn("invite-user: rejected non-admin request", { userId: inviter.id });
    return jsonResponse({ message: "Tu cuenta no tiene permiso para enviar invitaciones." }, 403);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ message: "La invitación no tiene un formato válido." }, 400);
  }

  const email = String(payload.email || "").trim().toLowerCase();
  const name = String(payload.name || "").trim().slice(0, 80);
  const message = String(payload.message || "").trim().slice(0, 280);
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    return jsonResponse({ message: "Escribe un correo válido." }, 400);
  }

  const inviterName = String(
    inviter.user_metadata?.display_name || inviter.email?.split("@")[0] || "Sebastian",
  ).trim().slice(0, 80);

  const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: inviteRedirectUrl(),
    data: {
      display_name: name || email.split("@")[0],
      invited_by_name: inviterName,
      invited_to: "Anvil",
      invitation_message: message,
    },
  });

  if (inviteError) {
    const detail = inviteError.message.toLowerCase();
    console.warn("invite-user: Supabase invite failed", { code: inviteError.code, status: inviteError.status });
    if (detail.includes("already") || detail.includes("registered") || detail.includes("exists")) {
      return jsonResponse({ message: "Ese correo ya tiene una cuenta. Puede iniciar sesión o recuperar su contraseña." }, 409);
    }
    if (detail.includes("rate") || inviteError.status === 429) {
      return jsonResponse({ message: "Se alcanzó el límite temporal de correos. Espera unos minutos e inténtalo otra vez." }, 429);
    }
    return jsonResponse({ message: "Supabase no pudo enviar la invitación. Inténtalo nuevamente." }, 502);
  }

  console.info("invite-user: invitation sent", { inviterId: inviter.id, inviteeDomain: email.split("@")[1] });
  return jsonResponse({ ok: true, email });
});
