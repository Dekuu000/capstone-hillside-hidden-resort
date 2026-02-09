import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from './hooks/useAuth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { GuestDashboard } from './pages/GuestDashboard';
import { Loader2 } from 'lucide-react';
import './index.css';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

// Admin pages are lazy-loaded to reduce initial guest bundle size.
const AdminDashboard = lazy(() => import('./pages/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const UnitsPage = lazy(() => import('./pages/UnitsPage').then((m) => ({ default: m.UnitsPage })));
const UnitFormPage = lazy(() => import('./pages/UnitFormPage').then((m) => ({ default: m.UnitFormPage })));
const ReservationsPage = lazy(() => import('./pages/ReservationsPage').then((m) => ({ default: m.ReservationsPage })));
const PaymentsPage = lazy(() => import('./pages/PaymentsPage').then((m) => ({ default: m.PaymentsPage })));
const ReservationDetailsPage = lazy(() => import('./pages/ReservationDetailsPage').then((m) => ({ default: m.ReservationDetailsPage })));
const NewReservationPage = lazy(() => import('./pages/NewReservationPage').then((m) => ({ default: m.NewReservationPage })));
const AdminTourBookingPage = lazy(() => import('./pages/AdminTourBookingPage').then((m) => ({ default: m.AdminTourBookingPage })));
const AdminScanPage = lazy(() => import('./pages/AdminScanPage').then((m) => ({ default: m.AdminScanPage })));
const GuestBookingPage = lazy(() => import('./pages/GuestBookingPage').then((m) => ({ default: m.GuestBookingPage })));
const GuestTourBookingPage = lazy(() => import('./pages/GuestTourBookingPage').then((m) => ({ default: m.GuestTourBookingPage })));
const MyBookingsPage = lazy(() => import('./pages/MyBookingsPage').then((m) => ({ default: m.MyBookingsPage })));

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<RouteLoader />}>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Protected Routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <RoleBasedHome />
                </ProtectedRoute>
              }
            />

            {/* Admin Routes */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/units"
              element={
                <ProtectedRoute requireAdmin>
                  <UnitsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/units/new"
              element={
                <ProtectedRoute requireAdmin>
                  <UnitFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/units/:unitId/edit"
              element={
                <ProtectedRoute requireAdmin>
                  <UnitFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/reservations"
              element={
                <ProtectedRoute requireAdmin>
                  <ReservationsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/reservations/:reservationId"
              element={
                <ProtectedRoute requireAdmin>
                  <ReservationDetailsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/reservations/new"
              element={
                <ProtectedRoute requireAdmin>
                  <NewReservationPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/payments"
              element={
                <ProtectedRoute requireAdmin>
                  <PaymentsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/scan"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminScanPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/tours/new"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminTourBookingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/scan"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminScanPage />
                </ProtectedRoute>
              }
            />

            {/* Guest Routes */}
            <Route
              path="/book"
              element={
                <ProtectedRoute>
                  <GuestBookingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tours"
              element={
                <ProtectedRoute>
                  <GuestTourBookingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-bookings"
              element={
                <ProtectedRoute>
                  <MyBookingsPage />
                </ProtectedRoute>
              }
            />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function RouteLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-10 h-10 text-primary animate-spin" />
    </div>
  );
}

// Component to redirect based on user role
function RoleBasedHome() {
  const { isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  return isAdmin ? <AdminDashboard /> : <GuestDashboard />;
}

export default App;
