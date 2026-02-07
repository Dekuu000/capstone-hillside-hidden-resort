import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus, AlertCircle, CheckCircle } from 'lucide-react';
import { useSignUp } from '../hooks/useAuth';
import { registerSchema, type RegisterFormData } from '../features/auth/schemas';

export function RegisterPage() {
    const navigate = useNavigate();
    const { signUp, loading } = useSignUp();
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<RegisterFormData>({
        resolver: zodResolver(registerSchema),
    });

    async function onSubmit(data: RegisterFormData) {
        try {
            setError(null);
            setSuccess(false);
            await signUp(data.email, data.password, data.name, data.phone || undefined);
            setSuccess(true);
            setTimeout(() => navigate('/login'), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create account');
        }
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
            <div className="w-full max-w-md">
                <div className="bg-white rounded-2xl shadow-xl p-8">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
                            <UserPlus className="w-8 h-8 text-primary" />
                        </div>
                        <h1 className="text-3xl font-bold text-primary mb-2">Create Account</h1>
                        <p className="text-gray-600">Join Hillside Hidden Resort</p>
                    </div>

                    {/* Success Alert */}
                    {success && (
                        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start" role="alert">
                            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
                            <div>
                                <p className="text-sm font-medium text-green-800">Account created successfully!</p>
                                <p className="text-sm text-green-700 mt-1">Redirecting to login...</p>
                            </div>
                        </div>
                    )}

                    {/* Error Alert */}
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start" role="alert">
                            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
                            <p className="text-sm text-red-800">{error}</p>
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                                Full Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                {...register('name')}
                                type="text"
                                id="name"
                                className={`input w-full ${errors.name ? 'input-error' : ''}`}
                                placeholder="Juan Dela Cruz"
                                disabled={loading}
                            />
                            {errors.name && (
                                <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
                            )}
                        </div>

                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                                Email Address <span className="text-red-500">*</span>
                            </label>
                            <input
                                {...register('email')}
                                type="email"
                                id="email"
                                className={`input w-full ${errors.email ? 'input-error' : ''}`}
                                placeholder="you@example.com"
                                disabled={loading}
                            />
                            {errors.email && (
                                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                            )}
                        </div>

                        <div>
                            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                                Mobile Number <span className="text-gray-400 text-xs">(optional)</span>
                            </label>
                            <input
                                {...register('phone')}
                                type="tel"
                                id="phone"
                                className={`input w-full ${errors.phone ? 'input-error' : ''}`}
                                placeholder="09123456789"
                                disabled={loading}
                            />
                            {errors.phone && (
                                <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
                            )}
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                                Password <span className="text-red-500">*</span>
                            </label>
                            <input
                                {...register('password')}
                                type="password"
                                id="password"
                                className={`input w-full ${errors.password ? 'input-error' : ''}`}
                                placeholder="At least 6 characters"
                                disabled={loading}
                            />
                            {errors.password && (
                                <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
                            )}
                        </div>

                        <div>
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                                Confirm Password <span className="text-red-500">*</span>
                            </label>
                            <input
                                {...register('confirmPassword')}
                                type="password"
                                id="confirmPassword"
                                className={`input w-full ${errors.confirmPassword ? 'input-error' : ''}`}
                                placeholder="Re-type password"
                                disabled={loading}
                            />
                            {errors.confirmPassword && (
                                <p className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading || success}
                            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Creating account...' : 'Create Account'}
                        </button>
                    </form>

                    {/* Footer */}
                    <div className="mt-6 text-center text-sm text-gray-600">
                        Already have an account?{' '}
                        <Link to="/login" className="text-primary font-semibold hover:underline">
                            Sign in
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
