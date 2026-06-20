import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(
    supabaseUrl &&
    supabaseKey &&
    !supabaseUrl.includes("your-project-ref") &&
    !supabaseKey.startsWith("your-")
);

export const supabase = isSupabaseConfigured
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        },
        global: {
            headers: {
                "X-Client-Info": "fatigue-analysis-web"
            }
        }
    })
    : null;

if (!isSupabaseConfigured) {
    console.info(
        "Supabase is not configured. Create .env from .env.example and restart the Vite dev server."
    );
}
