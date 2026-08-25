import React, { useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import CarrierLayout  from './components/ui/CarrierLayout';

// Public views
import Login  from './views/Login';
import Signup from './views/Signup';

// BI Analytics views
import CarrierDashboard from './views/CarrierDashboard';
import SplitViewConsole from './views/SplitViewConsole';
import ShipmentsManager from './views/ShipmentsManager';
import PackageHistory   from './views/PackageHistory';

/* ── Auth guard — always wraps in Control Tower layout ────────────────────── */
const ProtectedRoute = ({ children, useLayout = true }) => {
  const { user, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="w-10 h-10 border-4 border-[#16a34a] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (!useLayout) return children;

  return <CarrierLayout>{children}</CarrierLayout>;
};

function App() {
  return (
    <AuthProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          {/* Public */}
          <Route path="/login"  element={<Login />}  />
          <Route path="/signup" element={<Signup />} />

          {/* Home (Executive Dashboard) */}
          <Route path="/" element={
            <ProtectedRoute><CarrierDashboard /></ProtectedRoute>
          } />

          {/* ── BI Control Tower Analytics routes ─────────────────── */}
          <Route path="/console" element={
            <ProtectedRoute><SplitViewConsole /></ProtectedRoute>
          } />
          <Route path="/shipments" element={
            <ProtectedRoute><ShipmentsManager /></ProtectedRoute>
          } />
          <Route path="/history" element={
            <ProtectedRoute><PackageHistory /></ProtectedRoute>
          } />

          {/* Redirect legacy views to unified console */}
          <Route path="/space" element={<Navigate to="/console" replace />} />
          <Route path="/routes" element={<Navigate to="/console" replace />} />
          <Route path="/consolidate" element={<Navigate to="/console" replace />} />
          <Route path="/predictions" element={<Navigate to="/console" replace />} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
