import { createClient } from "@supabase/supabase-js";

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "[supabase] Missing env vars — copy .env.example to .env and fill in your project credentials."
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
