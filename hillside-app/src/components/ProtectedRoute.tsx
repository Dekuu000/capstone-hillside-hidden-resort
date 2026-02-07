import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Loader2, AlertCircle } from 'lucide-react';

interface ProtectedRouteProps {
    children: ReactNode;
    requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
    const { user, profile, loading, isAdmin } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
                    <p className="text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    // Not logged in at all
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // User is logged in but profile failed to load - show error
    if (!profile) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center px-4">
                <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
                    <AlertCircle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">Profile Not Found</h2>
                    <p className="text-gray-600 mb-6">
                        Your profile could not be loaded. This may be a database issue.
                        Please check that the users table migration has been run in Supabase.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="btn-primary inline-block cursor-pointer"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (requireAdmin && !isAdmin) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center px-4">
                <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
                    <h2 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h2>
                    <p className="text-gray-600 mb-6">
                        You don't have permission to access this page. Admin access required.
                    </p>
                    <a href="/" className="btn-primary inline-block">
                        Go to Homepage
                    </a>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
