import React, { useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import RoleLayout from './components/ui/RoleLayout';

// Public views
import Login from './views/Login';
import Signup from './views/Signup';
import StopScan from './views/StopScan';

// Customer views
import CustomerDashboard from './views/customer/CustomerDashboard';
import SearchSpaceView from './views/customer/SearchSpaceView';
import MyShipmentsView from './views/customer/MyShipmentsView';
import MyBookingsView from './views/customer/MyBookingsView';
import TrackShipmentView from './views/customer/TrackShipmentView';
import CustomerProfileView from './views/customer/CustomerProfileView';

// Logistics Manager views
import ManagerOperationsDashboard from './views/manager/ManagerOperationsDashboard';
import ManagerShipmentsView from './views/manager/ManagerShipmentsView';
import ManagerTripsView from './views/manager/ManagerTripsView';
import ManagerOptimizationView from './views/manager/ManagerOptimizationView';
import ManagerLoadPlansView from './views/manager/ManagerLoadPlansView';
import ManagerLiveTripOpsView from './views/manager/ManagerLiveTripOpsView';
import ManagerStopOpsView from './views/manager/ManagerStopOpsView';
import ManagerFleetView from './views/manager/ManagerFleetView';
import ManagerRoutesView from './views/manager/ManagerRoutesView';
import ManagerAnalyticsView from './views/manager/ManagerAnalyticsView';
import ManagerAuditView from './views/manager/ManagerAuditView';

// Carrier views
import CarrierFleetView from './views/carrier/CarrierFleetView';
import CarrierTripsView from './views/carrier/CarrierTripsView';
import CarrierVehiclesView from './views/carrier/CarrierVehiclesView';
import CarrierTripOpsView from './views/carrier/CarrierTripOpsView';
import CarrierLoadStatusView from './views/carrier/CarrierLoadStatusView';

/* ── Auth guard wrapping in dynamic RoleLayout ───────────────────────────── */
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="w-10 h-10 border-4 border-[#16a34a] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <RoleLayout>{children}</RoleLayout>;
};

/* ── Role-based Home Redirection ─────────────────────────────────────────── */
const RoleHomeRedirect = () => {
  const { user, loading } = useContext(AuthContext);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  const role = user.role || 'customer';
  if (['admin', 'logistics_manager'].includes(role)) {
    return <Navigate to="/manager/dashboard" replace />;
  }
  if (role === 'carrier') {
    return <Navigate to="/carrier/fleet" replace />;
  }
  return <Navigate to="/customer/dashboard" replace />;
};

function App() {
  return (
    <AuthProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/stop-scan" element={<StopScan />} />

          {/* Root Role-Based Smart Redirect */}
          <Route path="/" element={<RoleHomeRedirect />} />

          {/* ── CUSTOMER / SHIPPER ROUTES ──────────────────────── */}
          <Route path="/customer/dashboard" element={<ProtectedRoute><CustomerDashboard /></ProtectedRoute>} />
          <Route path="/customer/search" element={<ProtectedRoute><SearchSpaceView /></ProtectedRoute>} />
          <Route path="/customer/shipments" element={<ProtectedRoute><MyShipmentsView /></ProtectedRoute>} />
          <Route path="/customer/bookings" element={<ProtectedRoute><MyBookingsView /></ProtectedRoute>} />
          <Route path="/customer/track" element={<ProtectedRoute><TrackShipmentView /></ProtectedRoute>} />
          <Route path="/customer/profile" element={<ProtectedRoute><CustomerProfileView /></ProtectedRoute>} />

          {/* ── LOGISTICS MANAGER ROUTES ───────────────────────── */}
          <Route path="/manager/dashboard" element={<ProtectedRoute><ManagerOperationsDashboard /></ProtectedRoute>} />
          <Route path="/manager/shipments" element={<ProtectedRoute><ManagerShipmentsView /></ProtectedRoute>} />
          <Route path="/manager/trips" element={<ProtectedRoute><ManagerTripsView /></ProtectedRoute>} />
          <Route path="/manager/optimizer" element={<ProtectedRoute><ManagerOptimizationView /></ProtectedRoute>} />
          <Route path="/manager/load-plans" element={<ProtectedRoute><ManagerLoadPlansView /></ProtectedRoute>} />
          <Route path="/manager/live-trip" element={<ProtectedRoute><ManagerLiveTripOpsView /></ProtectedRoute>} />
          <Route path="/manager/stop-ops" element={<ProtectedRoute><ManagerStopOpsView /></ProtectedRoute>} />
          <Route path="/manager/fleet" element={<ProtectedRoute><ManagerFleetView /></ProtectedRoute>} />
          <Route path="/manager/routes" element={<ProtectedRoute><ManagerRoutesView /></ProtectedRoute>} />
          <Route path="/manager/analytics" element={<ProtectedRoute><ManagerAnalyticsView /></ProtectedRoute>} />
          <Route path="/manager/audit" element={<ProtectedRoute><ManagerAuditView /></ProtectedRoute>} />

          {/* ── CARRIER ROUTES ─────────────────────────────────── */}
          <Route path="/carrier/fleet" element={<ProtectedRoute><CarrierFleetView /></ProtectedRoute>} />
          <Route path="/carrier/trips" element={<ProtectedRoute><CarrierTripsView /></ProtectedRoute>} />
          <Route path="/carrier/vehicles" element={<ProtectedRoute><CarrierVehiclesView /></ProtectedRoute>} />
          <Route path="/carrier/trip-ops" element={<ProtectedRoute><CarrierTripOpsView /></ProtectedRoute>} />
          <Route path="/carrier/load-status" element={<ProtectedRoute><CarrierLoadStatusView /></ProtectedRoute>} />

          {/* Backward compatibility redirects */}
          <Route path="/marketplace" element={<Navigate to="/customer/search" replace />} />
          <Route path="/manager" element={<Navigate to="/manager/optimizer" replace />} />
          <Route path="/shipments" element={<Navigate to="/customer/shipments" replace />} />

          {/* Catch-all fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
