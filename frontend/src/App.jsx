import React, { useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import RoleLayout from './components/ui/RoleLayout';

// Public views
import Login from './views/Login';
import Signup from './views/Signup';
import RegisterLogisticsCompany from './views/RegisterLogisticsCompany';
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
import ManagerMLIntelligenceView from './views/manager/ManagerMLIntelligenceView';

/* ── Authoritative Post-Login Route Resolution (Requirement 11) ────────── */
export const getPostLoginRoute = (role) => {
  if (role === 'logistics_manager' || role === 'admin') {
    return '/manager/dashboard';
  }
  if (role === 'customer') {
    return '/customer/dashboard';
  }
  return '/login';
};

/* ── Auth guard with strict server-side role validation ───────────────────── */
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="w-10 h-10 border-4 border-[#16a34a] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const rawRole = user.role;
  const isManager = rawRole === 'logistics_manager' || rawRole === 'admin';
  const isCustomer = rawRole === 'customer';
  const canonicalRole = isManager ? 'logistics_manager' : (isCustomer ? 'customer' : null);

  // If role is missing/invalid, RoleLayout renders Account Configuration Error
  if (!canonicalRole) {
    return <RoleLayout>{children}</RoleLayout>;
  }

  // Cross-role URL tampering protection (Requirements 3, 4, 11, 12)
  if (allowedRoles && !allowedRoles.includes(canonicalRole)) {
    const targetDashboard = getPostLoginRoute(canonicalRole);
    return <Navigate to={targetDashboard} replace />;
  }

  return <RoleLayout>{children}</RoleLayout>;
};

/* ── Role-based Home Redirection (Two-Role Architecture) ─────────────────── */
const RoleHomeRedirect = () => {
  const { user, loading } = useContext(AuthContext);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  const targetDashboard = getPostLoginRoute(user.role);
  return <Navigate to={targetDashboard} replace />;
};

function App() {
  return (
    <AuthProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/register-logistics-company" element={<RegisterLogisticsCompany />} />
          <Route path="/stop-scan" element={<StopScan />} />

          {/* Root Role-Based Smart Redirect */}
          <Route path="/" element={<RoleHomeRedirect />} />

          {/* ── CUSTOMER / SHIPPER ROUTES ──────────────────────── */}
          <Route path="/customer/dashboard" element={<ProtectedRoute allowedRoles={['customer']}><CustomerDashboard /></ProtectedRoute>} />
          <Route path="/customer/search" element={<ProtectedRoute allowedRoles={['customer']}><SearchSpaceView /></ProtectedRoute>} />
          <Route path="/customer/shipments" element={<ProtectedRoute allowedRoles={['customer']}><MyShipmentsView /></ProtectedRoute>} />
          <Route path="/customer/bookings" element={<ProtectedRoute allowedRoles={['customer']}><MyBookingsView /></ProtectedRoute>} />
          <Route path="/customer/track" element={<ProtectedRoute allowedRoles={['customer']}><TrackShipmentView /></ProtectedRoute>} />
          <Route path="/customer/profile" element={<ProtectedRoute allowedRoles={['customer']}><CustomerProfileView /></ProtectedRoute>} />

          {/* ── LOGISTICS MANAGER ROUTES ───────────────────────── */}
          <Route path="/manager/dashboard" element={<ProtectedRoute allowedRoles={['logistics_manager']}><ManagerOperationsDashboard /></ProtectedRoute>} />
          <Route path="/manager/shipments" element={<ProtectedRoute allowedRoles={['logistics_manager']}><ManagerShipmentsView /></ProtectedRoute>} />
          <Route path="/manager/trips" element={<ProtectedRoute allowedRoles={['logistics_manager']}><ManagerTripsView /></ProtectedRoute>} />
          <Route path="/manager/optimizer" element={<ProtectedRoute allowedRoles={['logistics_manager']}><ManagerOptimizationView /></ProtectedRoute>} />
          <Route path="/manager/load-plans" element={<ProtectedRoute allowedRoles={['logistics_manager']}><ManagerLoadPlansView /></ProtectedRoute>} />
          <Route path="/manager/live-trip" element={<ProtectedRoute allowedRoles={['logistics_manager']}><ManagerLiveTripOpsView /></ProtectedRoute>} />
          <Route path="/manager/stop-ops" element={<ProtectedRoute allowedRoles={['logistics_manager']}><ManagerStopOpsView /></ProtectedRoute>} />
          <Route path="/manager/fleet" element={<ProtectedRoute allowedRoles={['logistics_manager']}><ManagerFleetView /></ProtectedRoute>} />
          <Route path="/manager/routes" element={<ProtectedRoute allowedRoles={['logistics_manager']}><ManagerRoutesView /></ProtectedRoute>} />
          <Route path="/manager/analytics" element={<ProtectedRoute allowedRoles={['logistics_manager']}><ManagerAnalyticsView /></ProtectedRoute>} />
          <Route path="/manager/audit" element={<ProtectedRoute allowedRoles={['logistics_manager']}><ManagerAuditView /></ProtectedRoute>} />
          <Route path="/manager/predictions" element={<ProtectedRoute allowedRoles={['logistics_manager']}><ManagerMLIntelligenceView /></ProtectedRoute>} />

          {/* ── CARRIER TO MANAGER MIGRATION REDIRECTS ───────────── */}
          <Route path="/carrier/fleet" element={<Navigate to="/manager/fleet" replace />} />
          <Route path="/carrier/trips" element={<Navigate to="/manager/trips" replace />} />
          <Route path="/carrier/vehicles" element={<Navigate to="/manager/fleet" replace />} />
          <Route path="/carrier/trip-ops" element={<Navigate to="/manager/stop-ops" replace />} />
          <Route path="/carrier/load-status" element={<Navigate to="/manager/live-trip" replace />} />
          <Route path="/carrier/dashboard" element={<Navigate to="/manager/dashboard" replace />} />
          <Route path="/carrier" element={<Navigate to="/manager/dashboard" replace />} />

          {/* Backward compatibility redirects */}
          <Route path="/marketplace" element={<Navigate to="/customer/search" replace />} />
          <Route path="/manager" element={<Navigate to="/manager/dashboard" replace />} />
          <Route path="/shipments" element={<Navigate to="/customer/shipments" replace />} />

          {/* Catch-all fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
