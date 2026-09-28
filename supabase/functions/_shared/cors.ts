import { corsHeaders as sdkCorsHeaders } from "npm:@supabase/supabase-js@^2/cors";

const corsHeaders = {
  ...sdkCorsHeaders,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function handleCors(request: Request): Response | null {
  if (request.method === "OPTIONS") {
    return Response.json({ ok: true }, { status: 200, headers: corsHeaders });
  }
  return null;
}

export function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
