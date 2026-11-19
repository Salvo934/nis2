"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ACTIVE_ORG_COOKIE } from "@/features/organizations/active-organization";
import { dbErrorCode, mapDbError } from "@/features/organizations/errors";
import { fail, type ActionResult } from "@/lib/action-result";
import { DEFAULT_AUTHENTICATED_PATH } from "@/lib/auth/routes";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const DEMO_DISPLAY_NAME = "Visitatore demo";

/**
 * "Prova la demo": opens an anonymous session (no email, no password) and
 * gives the visitor their own copy of the fictitious company. Visitors never
 * share data. A registered user who is already signed in just goes to the app.
 */
export async function startDemoAction(): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return fail("La demo non è disponibile in questo ambiente.");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && !user.is_anonymous) redirect(DEFAULT_AUTHENTICATED_PATH);

  if (!user) {
    const { error } = await supabase.auth.signInAnonymously({
      options: { data: { full_name: DEMO_DISPLAY_NAME } },
    });
    if (error) {
      if (error.code === "anonymous_provider_disabled") {
        return fail("La demo non è ancora attiva. Riprova più tardi.");
      }
      if (error.status === 429 || error.code === "over_request_rate_limit") {
        return fail("Troppe richieste di demo da questa rete. Riprova tra qualche minuto.");
      }
      console.error("[demo] anonymous sign-in", error.code ?? error.status);
      return fail("Non è stato possibile avviare la demo. Riprova.");
    }
  }

  const { data: organizationId, error } = await supabase.rpc("create_demo_organization");
  if (error || !organizationId) {
    if (error && !dbErrorCode(error)) console.error("[demo] create", error.code);
    return fail(error ? mapDbError(error) : "Non è stato possibile preparare la demo. Riprova.");
  }

  (await cookies()).set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect(DEFAULT_AUTHENTICATED_PATH);
}

/** Leaves the demo (ends the anonymous session) and opens the sign-up page. */
export async function leaveDemoForSignupAction(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/signup");
}
