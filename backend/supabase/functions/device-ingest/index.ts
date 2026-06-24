// Supabase Edge Function: device-ingest
//
// Receives a measurement (e.g. ECG from a Raspberry Pi) and inserts it into
// public.manual_measurements with source = 'raspberry_pi'. Authenticated with a
// shared device key (x-device-key header) and inserts using the SERVICE ROLE, so
// the powerful key lives only here on the server - never in the browser or on the
// device beyond the shared secret.
//
// Deploy:   (from backend/ where the supabase project lives)
//   supabase functions deploy device-ingest --no-verify-jwt
//   supabase secrets set DEVICE_INGEST_KEY=<a-long-random-string>
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildIngestRow } from "./ingestCore.js";

function json(obj: unknown, status: number): Response {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" }
    });
}

Deno.serve(async (req: Request) => {
    if (req.method !== "POST") return json({ error: "POST only." }, 405);

    const expected = Deno.env.get("DEVICE_INGEST_KEY");
    const provided = req.headers.get("x-device-key");
    if (!expected || provided !== expected) return json({ error: "Unauthorized." }, 401);

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return json({ error: "Invalid JSON." }, 400);
    }

    const built = buildIngestRow(body);
    if ("error" in built) return json({ error: built.error }, built.status ?? 400);

    const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error } = await supabase.from("manual_measurements").insert(built.row);
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true }, 201);
});
