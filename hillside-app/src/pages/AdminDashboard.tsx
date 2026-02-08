import { AdminLayout } from '../components/layout/AdminLayout';
import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';
import { Building2, Calendar, CreditCard, Users } from 'lucide-react';

export function AdminDashboard() {
    const { profile } = useAuth();

    return (
        <AdminLayout>
            <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
                <p className="text-gray-600 mb-8">Welcome back, {profile?.name}!</p>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white rounded-xl shadow-md p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-3 bg-blue-100 rounded-lg">
                                <Building2 className="w-6 h-6 text-blue-600" />
                            </div>
                            <span className="text-2xl font-bold text-gray-900">12</span>
                        </div>
                        <h3 className="text-sm font-medium text-gray-600">Active Units</h3>
                    </div>

                    <div className="bg-white rounded-xl shadow-md p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-3 bg-green-100 rounded-lg">
                                <Calendar className="w-6 h-6 text-green-600" />
                            </div>
                            <span className="text-2xl font-bold text-gray-900">8</span>
                        </div>
                        <h3 className="text-sm font-medium text-gray-600">Today's Check-ins</h3>
                    </div>

                    <div className="bg-white rounded-xl shadow-md p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-3 bg-orange-100 rounded-lg">
                                <CreditCard className="w-6 h-6 text-orange-600" />
                            </div>
                            <span className="text-2xl font-bold text-gray-900">5</span>
                        </div>
                        <h3 className="text-sm font-medium text-gray-600">Pending Payments</h3>
                    </div>

                    <div className="bg-white rounded-xl shadow-md p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-3 bg-purple-100 rounded-lg">
                                <Users className="w-6 h-6 text-purple-600" />
                            </div>
                            <span className="text-2xl font-bold text-gray-900">24</span>
                        </div>
                        <h3 className="text-sm font-medium text-gray-600">Total Guests</h3>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white rounded-xl shadow-md p-6">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Link to="/admin/units" className="btn-primary justify-center text-center">
                            Manage Units
                        </Link>
                        <Link to="/admin/reservations" className="btn-secondary justify-center text-center">
                            View Reservations
                        </Link>
                        <Link to="/admin/scan" className="btn-secondary justify-center text-center">
                            Scan QR Code
                        </Link>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
