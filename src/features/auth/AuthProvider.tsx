import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {Session, User} from '@supabase/supabase-js';

import {authErrorMessage} from '../../lib/supabase/errors';
import {supabase} from '../../lib/supabase/client';

type SignInResult = {error: string | null};
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
  signUp: (
    email: string,
    password: string,
    metadata?: Record<string, unknown>,
  ) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<SignInResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({children}: {children: React.ReactNode}) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({data}) => {
      if (!cancelled) {
        setSession(data.session);
        setReady(true);
      }
    });

    const {data} = supabase.auth.onAuthStateChange((_event, next) => {
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
    await supabase.auth.signOut();
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const {error} = await supabase.auth.resetPasswordForEmail(email.trim());
    return {error: error ? authErrorMessage(error) : null};
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      session,
      user: session?.user ?? null,
      signIn,
      signUp,
      signOut,
      resetPassword,
    }),
    [ready, resetPassword, session, signIn, signOut, signUp],
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
