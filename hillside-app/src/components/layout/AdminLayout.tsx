import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    Building2,
    Calendar,
    CreditCard,
    QrCode,
    BarChart3,
    FileText,
    Ticket,
    Menu,
    X,
    LogOut
} from 'lucide-react';
import { useAuth, signOut } from '../../hooks/useAuth';

interface AdminLayoutProps {
    children: ReactNode;
}

const navigation = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Units', href: '/admin/units', icon: Building2 },
    { name: 'Reservations', href: '/admin/reservations', icon: Calendar },
    { name: 'Walk-in Tour', href: '/admin/tours/new', icon: Ticket },
    { name: 'Payments', href: '/admin/payments', icon: CreditCard },
    { name: 'Check-in', href: '/admin/scan', icon: QrCode },
    { name: 'Reports', href: '/admin/reports', icon: BarChart3 },
    { name: 'Audit Logs', href: '/admin/audit', icon: FileText },
];

export function AdminLayout({ children }: AdminLayoutProps) {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    async function handleSignOut() {
        await signOut();
        navigate('/login');
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Mobile sidebar backdrop */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
          fixed top-0 left-0 z-50 h-full w-64 bg-primary text-white transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
            >
                <div className="flex flex-col h-full">
                    {/* Logo */}
                    <div className="px-6 py-8 border-b border-white/10">
                        <h1 className="text-2xl font-bold">Hillside Resort</h1>
                        <p className="text-sm text-blue-200 mt-1">Admin Panel</p>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto scrollbar-hide">
                        {navigation.map((item) => {
                            const Icon = item.icon;
                            return (
                                <Link
                                    key={item.name}
                                    to={item.href}
                                    className="flex items-center px-3 py-3 rounded-lg text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                                    onClick={() => setSidebarOpen(false)}
                                >
                                    <Icon className="w-5 h-5 mr-3" />
                                    <span className="font-medium">{item.name}</span>
                                </Link>
                            );
                        })}
                    </nav>

                    {/* User Profile */}
                    <div className="px-6 py-6 border-t border-white/10">
                        <div className="flex items-center mb-4">
                            <div className="w-10 h-10 rounded-full bg-cta flex items-center justify-center font-bold text-sm">
                                {profile?.name?.charAt(0).toUpperCase()}
                            </div>
                            <div className="ml-3 flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{profile?.name}</p>
                                <p className="text-xs text-blue-200 truncate">{profile?.email}</p>
                            </div>
                        </div>
                        <button
                            onClick={handleSignOut}
                            className="flex items-center w-full px-3 py-2 text-sm text-white/80 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                        >
                            <LogOut className="w-4 h-4 mr-2" />
                            Sign Out
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <div className="lg:pl-64">
                {/* Top Bar (Mobile) */}
                <header className="sticky top-0 z-30 bg-white shadow-sm lg:hidden">
                    <div className="px-4 py-4 flex items-center justify-between">
                        <button
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            className="p-2 rounded-lg hover:bg-gray-100 cursor-pointer"
                        >
                            {sidebarOpen ? (
                                <X className="w-6 h-6 text-gray-600" />
                            ) : (
                                <Menu className="w-6 h-6 text-gray-600" />
                            )}
                        </button>
                        <h2 className="text-lg font-semibold text-gray-900">Hillside Resort</h2>
                        <div className="w-10" /> {/* Spacer */}
                    </div>
                </header>

                {/* Page Content */}
                <main className="p-6 lg:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}
