import React, { useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import {
  Truck, LayoutDashboard, Route, Search, Sliders,
  Zap, Sparkles, Bell, LogOut, User, Box, Clock
} from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Control Tower',        path: '/',            icon: LayoutDashboard },
  { label: 'Load Optimizer',       path: '/manager',     icon: Sliders         },
  { label: 'Space Marketplace',    path: '/marketplace', icon: Search          },
  { label: 'Shipment Manager',     path: '/shipments',   icon: Box             },
  { label: 'BI Control Console',   path: '/console',     icon: Truck           },
  { label: 'Package History',      path: '/history',     icon: Clock           },
];

const CarrierLayout = ({ children }) => {
  const { user, logout } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#f8fafc' }}
    >
      {/* ── TOP NAV ──────────────────────────────────────────── */}
      <header className="shrink-0 bg-white border-b border-gray-100 px-6 sm:px-10 py-3.5 flex items-center justify-between z-20">

        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-[#16a34a] rounded-lg flex items-center justify-center shadow-md shadow-green-600/25">
            <Truck className="w-4 h-4 text-white" />
          </div>
          <div className="leading-none">
            <span className="text-[15px] font-black text-gray-900 tracking-tight block">Cargolytics</span>
            <span className="text-[8px] font-black text-[#16a34a] uppercase tracking-[0.15em] block">BI Control Tower</span>
          </div>
        </div>

        {/* Pill nav */}
        <nav className="hidden md:flex items-center bg-gray-100 rounded-xl p-1 space-x-0.5">
          {NAV_ITEMS.map(({ label, path, icon: Icon }) => {
            const active = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className={`no-underline flex items-center space-x-1.5 px-4 py-2 rounded-lg text-[12px] font-bold transition-all duration-150 ${
                  active
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-[#16a34a]' : ''}`} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right controls */}
        <div className="flex items-center space-x-3">
          <button className="relative w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors cursor-pointer border-none">
            <Bell className="w-4 h-4" />
            <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-[#16a34a] rounded-full" />
          </button>

          <div className="hidden sm:flex items-center space-x-2 bg-gray-100 rounded-xl px-3 py-2">
            <div className="w-6 h-6 rounded-lg bg-[#16a34a]/10 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-[#16a34a]" />
            </div>
            <div className="leading-none">
              <p className="text-[11px] font-black text-gray-900">{user?.username}</p>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                Analytics Portal
              </p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-gray-400 transition-colors cursor-pointer border-none"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── MAIN CONTENT ─────────────────────────────────────── */}
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 sm:px-10 py-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default CarrierLayout;

