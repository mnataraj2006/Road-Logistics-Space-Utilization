import React, { useContext, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import {
  Truck, Search, Box, CalendarCheck, MapPin, User, LogOut,
  Sliders, ShieldCheck, Activity, Layers, Route as RouteIcon,
  BarChart3, FileCheck, CheckCircle2, ChevronDown, RefreshCw
} from 'lucide-react';

const ROLE_NAV_MENUS = {
  customer: [
    { label: 'Dashboard',       path: '/customer/dashboard',  icon: Activity      },
    { label: 'Search Space',    path: '/customer/search',     icon: Search        },
    { label: 'My Shipments',    path: '/customer/shipments',  icon: Box           },
    { label: 'My Bookings',     path: '/customer/bookings',   icon: CalendarCheck },
    { label: 'Track Shipment',  path: '/customer/track',      icon: MapPin        },
    { label: 'Profile',         path: '/customer/profile',    icon: User          },
  ],
  logistics_manager: [
    { label: 'Ops Dashboard',   path: '/manager/dashboard',   icon: Activity      },
    { label: 'Shipments',       path: '/manager/shipments',   icon: Box           },
    { label: 'Trips Dispatch',  path: '/manager/trips',       icon: RouteIcon     },
    { label: 'Optimizer',       path: '/manager/optimizer',   icon: Sliders       },
    { label: 'Load Plans',      path: '/manager/load-plans',  icon: Layers        },
    { label: 'Live Operations', path: '/manager/live-trip',   icon: Truck         },
    { label: 'Stop Ops & QR',   path: '/manager/stop-ops',    icon: ShieldCheck   },
    { label: 'Fleet Assets',    path: '/manager/fleet',       icon: Truck         },
    { label: 'Route Lanes',     path: '/manager/routes',      icon: MapPin        },
    { label: 'Analytics',       path: '/manager/analytics',   icon: BarChart3     },
    { label: 'Security Audit',  path: '/manager/audit',       icon: FileCheck     },
  ],
  carrier: [
    { label: 'Fleet Overview',  path: '/carrier/fleet',       icon: Truck         },
    { label: 'Assigned Trips',  path: '/carrier/trips',       icon: RouteIcon     },
    { label: 'Vehicle Details', path: '/carrier/vehicles',    icon: Box           },
    { label: 'Trip Operations', path: '/carrier/trip-ops',    icon: ShieldCheck   },
    { label: 'Trailer Status',  path: '/carrier/load-status', icon: Layers        },
  ]
};

const RoleLayout = ({ children }) => {
  const { user, logout, updateUserRole } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();

  // Normalize role
  const rawRole = user?.role || 'customer';
  const activeRoleKey = ['admin', 'logistics_manager'].includes(rawRole)
    ? 'logistics_manager'
    : rawRole === 'carrier'
    ? 'carrier'
    : 'customer';

  const navItems = ROLE_NAV_MENUS[activeRoleKey] || ROLE_NAV_MENUS.customer;

  const handleRoleSwitch = (newRole) => {
    if (updateUserRole) {
      updateUserRole(newRole);
    } else {
      // Fallback update in localStorage
      const updatedUser = { ...user, role: newRole };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      window.location.reload();
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div
      className="min-h-screen flex flex-col bg-[#f8fafc]"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* ── TOP OPERATIONAL HEADER ──────────────────────────── */}
      <header className="sticky top-0 shrink-0 bg-white border-b border-gray-200 px-4 sm:px-8 py-3 flex items-center justify-between z-30 shadow-xs">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-600 rounded-xl flex items-center justify-center shadow-md shadow-emerald-600/20">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-sm font-black text-gray-900 tracking-tight leading-none block">
              Road Logistics Space
            </span>
            <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mt-0.5 block">
              Dynamic Optimization Platform
            </span>
          </div>
        </div>

        {/* Dynamic Role Navigation Pills */}
        <nav className="hidden lg:flex items-center bg-gray-100/80 rounded-xl p-1 gap-0.5 max-w-[60vw] overflow-x-auto">
          {navItems.map(({ label, path, icon: Icon }) => {
            const isActive = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className={`no-underline flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                  isActive
                    ? 'bg-white text-gray-900 shadow-sm border border-gray-200/50'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-white/50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-600' : 'text-gray-400'}`} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User, Role Switcher & Controls */}
        <div className="flex items-center gap-3">
          {/* Quick Role Switcher */}
          <div className="hidden sm:flex items-center gap-1.5 bg-emerald-50/80 border border-emerald-200/60 rounded-xl px-2.5 py-1">
            <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wide">
              Role:
            </span>
            <select
              value={activeRoleKey}
              onChange={(e) => handleRoleSwitch(e.target.value)}
              className="bg-transparent text-xs font-bold text-emerald-950 border-none outline-none cursor-pointer"
            >
              <option value="customer">Customer / Shipper</option>
              <option value="logistics_manager">Logistics Manager</option>
              <option value="carrier">Carrier Fleet</option>
            </select>
          </div>

          {/* User Profile Tag */}
          <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-1.5">
            <div className="w-6 h-6 rounded-lg bg-emerald-600/10 flex items-center justify-center text-emerald-700 font-bold text-xs">
              {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="hidden md:block leading-tight">
              <p className="text-xs font-bold text-gray-900 truncate max-w-[100px]">
                {user?.username || 'Guest'}
              </p>
              <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
                {activeRoleKey.replace('_', ' ')}
              </p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-500 flex items-center justify-center transition cursor-pointer border-none"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── MOBILE ROLE NAV (Scrollable) ────────────────────── */}
      <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-1 overflow-x-auto shadow-xs">
        {navItems.map(({ label, path, icon: Icon }) => {
          const isActive = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={`no-underline flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold shrink-0 ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>

      {/* ── MAIN CONTENT CONTAINER ──────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6">
        {children}
      </main>
    </div>
  );
};

export default RoleLayout;
