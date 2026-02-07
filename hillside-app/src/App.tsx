import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from './hooks/useAuth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { GuestDashboard } from './pages/GuestDashboard';
import { UnitsPage } from './pages/UnitsPage';
import { UnitFormPage } from './pages/UnitFormPage';
import { ReservationsPage } from './pages/ReservationsPage';
import { NewReservationPage } from './pages/NewReservationPage';
import { GuestBookingPage } from './pages/GuestBookingPage';
import { MyBookingsPage } from './pages/MyBookingsPage';
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
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
            path="/admin/reservations/new"
            element={
              <ProtectedRoute requireAdmin>
                <NewReservationPage />
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
      </BrowserRouter>
    </QueryClientProvider>
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

