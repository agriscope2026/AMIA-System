import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("The account-management function is missing its Supabase server configuration");
    }
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) throw new Error("Authentication is required");

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) throw new Error("Authentication is required");

    const payload = await request.json();
    const { programId, email, fullName, password, role } = payload;
    if (typeof email !== "string" || !email.trim() || typeof fullName !== "string" || !fullName.trim()
      || typeof password !== "string" || !["superadmin", "program_admin", "viewer"].includes(role)) {
      throw new Error("Full name, email, password, and a valid role are required");
    }
    if (password.length < 8) throw new Error("Password must contain at least 8 characters");
    if (role !== "superadmin" && (typeof programId !== "string" || !programId)) {
      throw new Error("A program is required for program accounts");
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: creatorProfile, error: creatorProfileError } = await adminClient.from("profiles").select("system_role").eq("id", userData.user.id).single();
    if (creatorProfileError) throw creatorProfileError;
    const isSuperadmin = creatorProfile?.system_role === "superadmin";
    let isProgramAdmin = false;
    if (programId) {
      const { data: creatorMembership, error: membershipLookupError } = await adminClient
        .from("program_members").select("role").eq("program_id", programId).eq("user_id", userData.user.id).maybeSingle();
      if (membershipLookupError) throw membershipLookupError;
      isProgramAdmin = creatorMembership?.role === "program_admin";
    }

    if (role === "superadmin" || role === "program_admin") {
      if (!isSuperadmin) throw new Error("Only a superadmin can create this account type");
    } else if (!isSuperadmin && !isProgramAdmin) {
      throw new Error("Only a superadmin or program admin can create viewer accounts");
    }
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = fullName.trim();
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({ email: normalizedEmail, password, email_confirm: true, user_metadata: { full_name: normalizedName } });
    if (createError) throw createError;
    if (!created.user) throw new Error("Account creation failed");

    try {
      const { error: profileError } = await adminClient.from("profiles").upsert({ id: created.user.id, full_name: normalizedName, email: normalizedEmail, system_role: role === "superadmin" ? "superadmin" : "user" });
      if (profileError) throw profileError;
      if (role !== "superadmin") {
        const { error: membershipError } = await adminClient.from("program_members").insert({ program_id: programId, user_id: created.user.id, role });
        if (membershipError) throw membershipError;
      }
    } catch (error) {
      const { error: rollbackError } = await adminClient.auth.admin.deleteUser(created.user.id);
      if (rollbackError) {
        throw new Error(
          `${error instanceof Error ? error.message : "Account setup failed"}; cleanup failed for the new Auth user: ${rollbackError.message}`,
          { cause: error },
        );
      }
      throw error;
    }

    return jsonResponse({ message: `${role} account created for ${normalizedEmail}` });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected error" }, 400);
  }
});
