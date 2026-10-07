import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {Session, User} from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';

import {authErrorMessage} from '../../lib/supabase/errors';
import {supabase} from '../../lib/supabase/client';

/** Must be listed under Auth → URL Configuration → Redirect URLs in Supabase. */
const OAUTH_REDIRECT = 'paisa://auth-callback';

type SignInResult = {error: string | null};
type OAuthResult = {error: string | null; cancelled: boolean};

/** OAuth callbacks carry params in the query (PKCE) or the hash (errors). */
function callbackParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const parts = url.split(/[?#]/).slice(1);
  for (const part of parts) {
    for (const pair of part.split('&')) {
      const [key, value = ''] = pair.split('=');
      if (key) {
        params[decodeURIComponent(key)] = decodeURIComponent(
          value.replace(/\+/g, ' '),
        );
      }
    }
  }
  return params;
}
type SignUpResult = {
  error: string | null;
  needsEmailConfirm: boolean;
  userId: string | null;
};

type AuthContextValue = {
  ready: boolean;
  session: Session | null;
  user: User | null;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signInWithGoogle: () => Promise<OAuthResult>;
  signUp: (
    email: string,
    password: string,
    metadata?: Record<string, unknown>,
  ) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<SignInResult>;
  verifyResetCode: (email: string, code: string) => Promise<SignInResult>;
  updateRecoveredPassword: (newPassword: string) => Promise<SignInResult>;
  cancelPasswordReset: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({children}: {children: React.ReactNode}) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const recoveringRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({data}) => {
      if (!cancelled) {
        setSession(data.session);
        setReady(true);
      }
    });

    const {data} = supabase.auth.onAuthStateChange((_event, next) => {
      if (recoveringRef.current) {
        return;
      }
      setSession(next);
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const {error} = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return {error: error ? authErrorMessage(error) : null};
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<OAuthResult> => {
    const {data, error} = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: OAUTH_REDIRECT,
        skipBrowserRedirect: true,
        queryParams: {prompt: 'select_account'},
      },
    });
    if (error || !data?.url) {
      return {error: authErrorMessage(error), cancelled: false};
    }

    const result = await WebBrowser.openAuthSessionAsync(
      data.url,
      OAUTH_REDIRECT,
    );
    if (result.type !== 'success') {
      return {error: null, cancelled: true};
    }

    const params = callbackParams(result.url);
    if (params.error) {
      return {
        error: authErrorMessage({
          message: params.error_description || params.error,
        }),
        cancelled: false,
      };
    }
    if (!params.code) {
      return {error: 'Google did not return a sign-in code.', cancelled: false};
    }

    const exchange = await supabase.auth.exchangeCodeForSession(params.code);
    return {
      error: exchange.error ? authErrorMessage(exchange.error) : null,
      cancelled: false,
    };
  }, []);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      metadata?: Record<string, unknown>,
    ) => {
      const {data, error} = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: metadata ? {data: metadata} : undefined,
      });
      if (error) {
        return {
          error: authErrorMessage(error),
          needsEmailConfirm: false,
          userId: null,
        };
      }
      return {
        error: null,
        needsEmailConfirm: !data.session,
        userId: data.user?.id ?? null,
      };
    },
    [],
  );

  const signOut = useCallback(async () => {
    const {error} = await supabase.auth.signOut();
    if (error) {
      await supabase.auth.signOut({scope: 'local'});
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const {error} = await supabase.auth.resetPasswordForEmail(email.trim());
    return {error: error ? authErrorMessage(error) : null};
  }, []);

  // The recovery session from verifyOtp is kept out of app state so the user
  // stays on the login screen until the new password is saved.
  const verifyResetCode = useCallback(async (email: string, code: string) => {
    recoveringRef.current = true;
    const {error} = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'recovery',
    });
    if (error) {
      recoveringRef.current = false;
      return {error: authErrorMessage(error)};
    }
    return {error: null};
  }, []);

  const updateRecoveredPassword = useCallback(async (newPassword: string) => {
    const {error} = await supabase.auth.updateUser({password: newPassword});
    if (error) {
      return {error: authErrorMessage(error)};
    }
    await supabase.auth.signOut({scope: 'local'});
    recoveringRef.current = false;
    setSession(null);
    return {error: null};
  }, []);

  const cancelPasswordReset = useCallback(async () => {
    if (!recoveringRef.current) {
      return;
    }
    await supabase.auth.signOut({scope: 'local'});
    recoveringRef.current = false;
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      session,
      user: session?.user ?? null,
      signIn,
      signInWithGoogle,
      signUp,
      signOut,
      resetPassword,
      verifyResetCode,
      updateRecoveredPassword,
      cancelPasswordReset,
    }),
    [
      cancelPasswordReset,
      ready,
      resetPassword,
      session,
      signIn,
      signInWithGoogle,
      signOut,
      signUp,
      updateRecoveredPassword,
      verifyResetCode,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return value;
}
