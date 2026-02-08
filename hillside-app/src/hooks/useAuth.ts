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
        const name = (user.user_metadata?.name as string | undefined) || 'Guest User';
        const phone = user.user_metadata?.phone as string | undefined;
        const role = (user.user_metadata?.role as string | undefined)
            || (user.app_metadata?.role as string | undefined)
            || 'guest';
        const fallbackProfile: User = {
            user_id: user.id,
            name,
            role: role === 'admin' ? 'admin' : 'guest',
            phone: phone || undefined,
            email: user.email || undefined,
            created_at: new Date().toISOString(),
        };

        try {
            const { data: profile, error } = await supabase
                .from('users')
                .select('*')
                .eq('user_id', user.id)
                .maybeSingle();

            if (!error && profile) {
                setAuthState({
                    user,
                    profile,
                    loading: false,
                    isAdmin: profile?.role === 'admin',
                });
                return;
            }

            // Attempt to create missing profile (self-insert)
            const { error: insertError } = await supabase
                .from('users')
                .insert({
                    user_id: user.id,
                    name,
                    phone: phone || null,
                    email: user.email || null,
                    role: fallbackProfile.role,
                });

            if (!insertError) {
                const { data: created, error: selectError } = await supabase
                    .from('users')
                    .select('*')
                    .eq('user_id', user.id)
                    .maybeSingle();

                if (!selectError && created) {
                    setAuthState({
                        user,
                        profile: created,
                        loading: false,
                        isAdmin: created.role === 'admin',
                    });
                    return;
                }
            }

            // Fallback to metadata-based profile so the app can proceed
            setAuthState({
                user,
                profile: fallbackProfile,
                loading: false,
                isAdmin: fallbackProfile.role === 'admin',
            });
        } catch {
            setAuthState({
                user,
                profile: fallbackProfile,
                loading: false,
                isAdmin: fallbackProfile.role === 'admin',
            });
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
