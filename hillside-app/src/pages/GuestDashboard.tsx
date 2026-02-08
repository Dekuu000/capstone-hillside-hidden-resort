import { Link } from 'react-router-dom';
import { GuestLayout } from '../components/layout/GuestLayout';
import { useAuth } from '../hooks/useAuth';
import { Calendar, Clock, MapPin } from 'lucide-react';

export function GuestDashboard() {
    const { profile } = useAuth();

    return (
        <GuestLayout>
            <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome, {profile?.name}!</h1>
                <p className="text-gray-600 mb-8">Plan your perfect getaway at Hillside Hidden Resort</p>

                {/* Hero Card */}
                <div className="bg-gradient-to-r from-primary to-secondary rounded-2xl shadow-xl p-8 mb-8 text-white">
                    <h2 className="text-2xl font-bold mb-4">Ready to book your stay?</h2>
                    <p className="mb-6 text-blue-100">
                        Enjoy breathtaking views, comfortable rooms, and unforgettable experiences.
                    </p>
                    <Link
                        to="/book"
                        className="inline-flex bg-cta hover:opacity-90 text-white px-8 py-3 rounded-lg font-semibold transition-all cursor-pointer"
                    >
                        Book Now
                    </Link>
                </div>

                {/* Info Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white rounded-xl shadow-md p-6">
                        <div className="flex items-center mb-4">
                            <div className="p-3 bg-blue-100 rounded-lg mr-4">
                                <Calendar className="w-6 h-6 text-blue-600" />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900">Flexible Booking</h3>
                        </div>
                        <p className="text-gray-600 text-sm">
                            Choose your dates with real-time availability checking
                        </p>
                    </div>

                    <div className="bg-white rounded-xl shadow-md p-6">
                        <div className="flex items-center mb-4">
                            <div className="p-3 bg-green-100 rounded-lg mr-4">
                                <Clock className="w-6 h-6 text-green-600" />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900">Quick Check-in</h3>
                        </div>
                        <p className="text-gray-600 text-sm">
                            QR-based contactless check-in for your convenience
                        </p>
                    </div>

                    <div className="bg-white rounded-xl shadow-md p-6">
                        <div className="flex items-center mb-4">
                            <div className="p-3 bg-orange-100 rounded-lg mr-4">
                                <MapPin className="w-6 h-6 text-orange-600" />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900">Perfect Location</h3>
                        </div>
                        <p className="text-gray-600 text-sm">
                            Nestled in a serene hillside with stunning views
                        </p>
                    </div>
                </div>

                {/* Recent Bookings */}
                <div className="bg-white rounded-xl shadow-md p-6">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Bookings</h2>
                    <div className="text-center py-8 text-gray-500">
                        <p>No bookings yet</p>
                        <p className="text-sm mt-2">Click "Book Now" to make your first reservation!</p>
                    </div>
                </div>
            </div>
        </GuestLayout>
    );
}
