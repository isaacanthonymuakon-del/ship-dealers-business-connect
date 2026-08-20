import { createClient } from "@supabase/supabase-js";

// The project URL and publishable key are intentionally public browser values.
// Supabase authorization must remain enforced by Auth and database RLS policies.
export const supabase = createClient(
  "https://xasxvgrpsemacdcqczoi.supabase.co",
  "sb_publishable_hPAyuLlzDYW7jGDt3MSWyQ_iAdH87qL",
);

// The administrator session is deliberately kept only in memory. It never
// shares the customer's saved browser session and must be entered again after
// leaving, refreshing, closing the tab, or opening another browser.
export const adminSupabase = createClient(
  "https://xasxvgrpsemacdcqczoi.supabase.co",
  "sb_publishable_hPAyuLlzDYW7jGDt3MSWyQ_iAdH87qL",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);
