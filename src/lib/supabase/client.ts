import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./env";

/** Tarayıcı tarafı Supabase istemcisi. */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
