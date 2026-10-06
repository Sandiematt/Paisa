import {clearBiometricPref} from '../biometricLock';
import {clearProfileCache} from '../profileStore';
import {supabase} from './client';
import {dataErrorMessage} from './errors';

/**
 * Calls the `delete-account` Edge Function, which removes the auth user and
 * (via cascades) every profile, category, and transaction row they own. Then
 * clears this device's caches and drops the now-invalid local session.
 */
export async function deleteAccount(): Promise<void> {
  const {data: sessionData} = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) {
    throw new Error('Sign in again to delete this account.');
  }

  const {error} = await supabase.functions.invoke('delete-account', {
    method: 'POST',
  });
  if (error) {
    let message: string | undefined;
    const context = (error as {context?: unknown}).context;
    if (context instanceof Response) {
      try {
        message = ((await context.json()) as {error?: string}).error;
      } catch {
        message = undefined;
      }
    }
    throw new Error(message ?? dataErrorMessage(error));
  }

  await Promise.allSettled([
    clearProfileCache(userId),
    clearBiometricPref(userId),
  ]);
  await supabase.auth.signOut({scope: 'local'});
}
