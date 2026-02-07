import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, User, LogOut, Ticket } from 'lucide-react';
import { useAuth, signOut } from '../../hooks/useAuth';

interface GuestLayoutProps {
    children: ReactNode;
}

export function GuestLayout({ children }: GuestLayoutProps) {
    const { profile } = useAuth();
    const navigate = useNavigate();

    async function handleSignOut() {
        await signOut();
        navigate('/login');
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="bg-white shadow-sm sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        {/* Logo */}
                        <Link to="/" className="flex items-center space-x-2 cursor-pointer">
                            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                                <span className="text-white font-bold">H</span>
                            </div>
                            <span className="font-bold text-xl text-primary hidden sm:block">
                                Hillside Resort
                            </span>
                        </Link>

                        {/* Navigation */}
                        <nav className="hidden md:flex items-center space-x-6">
                            <Link
                                to="/book"
                                className="flex items-center text-gray-700 hover:text-primary transition-colors cursor-pointer"
                            >
                                <Calendar className="w-5 h-5 mr-2" />
                                <span className="font-medium">Book Now</span>
                            </Link>
                            <Link
                                to="/tours"
                                className="flex items-center text-gray-700 hover:text-primary transition-colors cursor-pointer"
                            >
                                <Ticket className="w-5 h-5 mr-2" />
                                <span className="font-medium">Tours</span>
                            </Link>
                            <Link
                                to="/my-bookings"
                                className="flex items-center text-gray-700 hover:text-primary transition-colors cursor-pointer"
                            >
                                <User className="w-5 h-5 mr-2" />
                                <span className="font-medium">My Bookings</span>
                            </Link>
                        </nav>

                        {/* User Menu */}
                        <div className="flex items-center space-x-4">
                            <div className="hidden sm:block text-right">
                                <p className="text-sm font-medium text-gray-900">{profile?.name}</p>
                                <p className="text-xs text-gray-500">{profile?.email}</p>
                            </div>
                            <button
                                onClick={handleSignOut}
                                className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                            >
                                <LogOut className="w-4 h-4 mr-2" />
                                <span className="hidden sm:inline">Sign Out</span>
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {children}
            </main>

            {/* Mobile Navigation (Bottom Bar) */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30">
                <div className="flex justify-around items-center h-16">
                    <Link
                        to="/book"
                        className="flex flex-col items-center justify-center flex-1 text-gray-600 hover:text-primary cursor-pointer"
                    >
                        <Calendar className="w-6 h-6" />
                        <span className="text-xs mt-1">Book</span>
                    </Link>
                    <Link
                        to="/tours"
                        className="flex flex-col items-center justify-center flex-1 text-gray-600 hover:text-primary cursor-pointer"
                    >
                        <Ticket className="w-6 h-6" />
                        <span className="text-xs mt-1">Tours</span>
                    </Link>
                    <Link
                        to="/my-bookings"
                        className="flex flex-col items-center justify-center flex-1 text-gray-600 hover:text-primary cursor-pointer"
                    >
                        <User className="w-6 h-6" />
                        <span className="text-xs mt-1">Bookings</span>
                    </Link>
                    <button
                        onClick={handleSignOut}
                        className="flex flex-col items-center justify-center flex-1 text-gray-600 hover:text-primary cursor-pointer"
                    >
                        <LogOut className="w-6 h-6" />
                        <span className="text-xs mt-1">Logout</span>
                    </button>
                </div>
            </nav>
        </div>
    );
}
