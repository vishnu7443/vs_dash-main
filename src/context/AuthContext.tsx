import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Admin } from '../types/database.types';
import { queryClient } from '../lib/queryClient';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  adminProfile: Admin | null;
  isLoading: boolean;
  isAdmin: boolean;
  isDemoMode: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  enableDemoMode: (founderName?: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const DEMO_FOUNDER_VISHNU: Admin = {
  id: 'a0000000-0000-0000-0000-000000000001',
  user_id: 'user-founder-001',
  name: 'VISHNU VARDHAN R G',
  email: 'vishnu@vsstudio.com',
  created_at: new Date().toISOString(),
};

export const DEMO_FOUNDER_SRIRAM: Admin = {
  id: 'a0000000-0000-0000-0000-000000000002',
  user_id: 'user-founder-002',
  name: 'SRIRAM S',
  email: 'sriram@vsstudio.com',
  created_at: new Date().toISOString(),
};

function getDemoFounderProfile(name?: string | null): Admin {
  const chosenName = name || localStorage.getItem('vs_studio_demo_founder') || 'VISHNU VARDHAN R G';
  return chosenName.toUpperCase().includes('SRIRAM') ? DEMO_FOUNDER_SRIRAM : DEMO_FOUNDER_VISHNU;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [adminProfile, setAdminProfile] = useState<Admin | null>(() => {
    const isDemo = localStorage.getItem('vs_studio_demo_mode') === 'true';
    return isDemo ? getDemoFounderProfile() : null;
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
    return localStorage.getItem('vs_studio_demo_mode') === 'true';
  });

  const checkAdminStatus = useCallback(
    async (userId: string, email: string): Promise<{ admin: Admin | null; isNetworkError: boolean }> => {
      try {
        const { data, error } = await supabase
          .from('admins')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) {
          console.error('Error verifying admin table:', error);
          return { admin: null, isNetworkError: true };
        }
        return { admin: (data as Admin) || null, isNetworkError: false };
      } catch (err) {
        console.error('Admin check network failure:', err);
        return { admin: null, isNetworkError: true };
      }
    },
    []
  );

  useEffect(() => {
    if (isDemoMode) {
      setAdminProfile(getDemoFounderProfile());
      setIsLoading(false);
      return;
    }

    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    // Single consolidated auth listener to prevent race conditions
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!isMounted) return;

      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        const { admin, isNetworkError } = await checkAdminStatus(
          currentSession.user.id,
          currentSession.user.email || ''
        );

        if (!isMounted) return;

        if (admin) {
          setAdminProfile(admin);
        } else if (!isNetworkError) {
          // Explicitly non-admin account: deny access and sign out
          await supabase.auth.signOut();
          setAdminProfile(null);
          setUser(null);
          setSession(null);
        }
      } else {
        setAdminProfile(null);
      }
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [isDemoMode, checkAdminStatus]);

  const signIn = async (email: string, password: string): Promise<{ error: Error | null }> => {
    try {
      if (!isSupabaseConfigured) {
        // Automatically switch to demo mode if credentials are unconfigured
        enableDemoMode(email.toLowerCase().includes('sriram') ? 'SRIRAM S' : 'VISHNU VARDHAN R G');
        return { error: null };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: new Error(error.message) };
      }

      if (data.user) {
        const { admin, isNetworkError } = await checkAdminStatus(data.user.id, data.user.email || '');
        if (!admin) {
          if (isNetworkError) {
            return {
              error: new Error('Network error while verifying founder permissions. Please retry.'),
            };
          }
          await supabase.auth.signOut();
          return {
            error: new Error(
              'Access denied. This account is not authorized as a VS Studio founder admin.'
            ),
          };
        }
        setAdminProfile(admin);
      }

      return { error: null };
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error('Login failed');
      return { error };
    }
  };

  const signOut = async () => {
    // Clear in-memory React Query cache to protect sensitive client, proposal, and payment data
    queryClient.clear();

    if (isDemoMode) {
      localStorage.removeItem('vs_studio_demo_mode');
      localStorage.removeItem('vs_studio_demo_founder');
      setIsDemoMode(false);
      setAdminProfile(null);
      setUser(null);
      setSession(null);
      return;
    }

    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setAdminProfile(null);
  };

  const enableDemoMode = (founderName = 'VISHNU VARDHAN R G') => {
    localStorage.setItem('vs_studio_demo_mode', 'true');
    localStorage.setItem('vs_studio_demo_founder', founderName);
    setIsDemoMode(true);
    setAdminProfile(getDemoFounderProfile(founderName));
    setIsLoading(false);
  };

  const isAdmin = Boolean(adminProfile || isDemoMode);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        adminProfile,
        isLoading,
        isAdmin,
        isDemoMode,
        signIn,
        signOut,
        enableDemoMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
