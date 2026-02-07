import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { User } from '../types/database';

interface AuthState {
    user: SupabaseUser | null;
    profile: User | null;
    loading: boolean;
    isAdmin: boolean;
}

export function useAuth() {
    const [authState, setAuthState] = useState<AuthState>({
        user: null,
        profile: null,
        loading: true,
        isAdmin: false,
    });

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                fetchProfile(session.user);
            } else {
                setAuthState({ user: null, profile: null, loading: false, isAdmin: false });
            }
        });

        // Listen for auth changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                fetchProfile(session.user);
            } else {
                setAuthState({ user: null, profile: null, loading: false, isAdmin: false });
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    async function fetchProfile(user: SupabaseUser) {
        try {
            console.log('Fetching profile for user:', user.id);
            const { data: profile, error } = await supabase
                .from('users')
                .select('*')
                .eq('user_id', user.id)
                .single();

            if (error) {
                console.error('Profile fetch error:', error);
                // Still set the user, but profile will be null
                // This allows the user to be "logged in" even if profile fetch fails
                setAuthState({ user, profile: null, loading: false, isAdmin: false });
                return;
            }

            console.log('Profile fetched:', profile);
            setAuthState({
                user,
                profile,
                loading: false,
                isAdmin: profile?.role === 'admin',
            });
        } catch (error) {
            console.error('Error fetching profile:', error);
            setAuthState({ user, profile: null, loading: false, isAdmin: false });
        }
    }

    return authState;
}

export function useSignIn() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function signIn(email: string, password: string) {
        try {
            setLoading(true);
            setError(null);
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (signInError) throw signInError;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to sign in');
            throw err;
        } finally {
            setLoading(false);
        }
    }

    return { signIn, loading, error };
}

export function useSignUp() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function signUp(email: string, password: string, name: string, phone?: string, role: 'admin' | 'guest' = 'guest') {
        try {
            setLoading(true);
            setError(null);
            const { error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        name,
                        phone,
                        role,
                    },
                },
            });
            if (signUpError) throw signUpError;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to sign up');
            throw err;
        } finally {
            setLoading(false);
        }
    }

    return { signUp, loading, error };
}

export async function signOut() {
    await supabase.auth.signOut();
}
