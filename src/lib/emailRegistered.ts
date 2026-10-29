import {supabase} from './supabase/client';

/**
 * Whether an account already uses `email`, from the email_registered RPC.
 * Null when the answer is unknown (offline, or the function is not deployed
 * yet): sign-up then carries on, and Supabase still refuses a duplicate at
 * the end.
 */
export async function emailRegistered(email: string): Promise<boolean | null> {
  try {
    const {data, error} = await supabase.rpc('email_registered', {
      p_email: email.trim(),
    });
    if (error || typeof data !== 'boolean') {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}
