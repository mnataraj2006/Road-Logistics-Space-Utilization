import React, { useState, useEffect, useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import {
  Truck, Search, Box, CalendarCheck, MapPin, User, LogOut,
  Sliders, ShieldCheck, Activity, Layers, Route as RouteIcon,
  BarChart3, FileCheck, AlertCircle, Menu, X, ChevronLeft, ChevronRight
} from 'lucide-react';

/* ── Grouped Navigation Definition ────────────────────────────────────────── */
const ROLE_NAV_GROUPS = {
  logistics_manager: [
    {
      groupLabel: 'OPERATIONS',
      items: [
        { label: 'Ops Dashboard',   path: '/manager/dashboard',   icon: Activity   },
        { label: 'Shipments',       path: '/manager/shipments',   icon: Box        },
        { label: 'Trips & Dispatch',path: '/manager/trips',       icon: RouteIcon  }
      ]
    },
    {
      groupLabel: 'OPTIMIZATION',
      items: [
        { label: 'Space Optimizer', path: '/manager/optimizer',   icon: Sliders    },
        { label: 'Load Plans',      path: '/manager/load-plans',  icon: Layers     }
      ]
    },
    {
      groupLabel: 'LIVE OPERATIONS',
      items: [
        { label: 'Live Operations', path: '/manager/live-trip',   icon: Truck      },
        { label: 'Stop Ops & QR',   path: '/manager/stop-ops',    icon: ShieldCheck}
      ]
    },
    {
      groupLabel: 'FLEET',
      items: [
        { label: 'Fleet Assets',    path: '/manager/fleet',       icon: Truck      },
        { label: 'Route Lanes',     path: '/manager/routes',      icon: MapPin     }
      ]
    },
    {
      groupLabel: 'INSIGHTS',
      items: [
        { label: 'Analytics',       path: '/manager/analytics',   icon: BarChart3  },
        { label: 'Security Audit',  path: '/manager/audit',       icon: FileCheck  }
      ]
    }
  ],
  customer: [
    {
      groupLabel: 'OVERVIEW',
      items: [
        { label: 'Dashboard',       path: '/customer/dashboard',  icon: Activity     }
      ]
    },
    {
      groupLabel: 'SHIPMENTS & BOOKINGS',
      items: [
        { label: 'Search Space',    path: '/customer/search',     icon: Search       },
        { label: 'My Shipments',    path: '/customer/shipments',  icon: Box          },
        { label: 'My Bookings',     path: '/customer/bookings',   icon: CalendarCheck},
        { label: 'Track Shipment',  path: '/customer/track',      icon: MapPin       }
      ]
    },
    {
      groupLabel: 'ACCOUNT',
      items: [
        { label: 'Profile',         path: '/customer/profile',    icon: User         }
      ]
    }
  ]
};

const RoleLayout = ({ children }) => {
  const { user, logout } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();

  // Responsive sidebar drawer state (Mobile/Tablet)
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Desktop Collapsed Sidebar State (persisted in localStorage)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('app_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('app_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  // Close mobile drawer on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  // Canonical role resolution: strictly customer or logistics_manager
  const rawRole = user?.role;
  const isManager = rawRole === 'logistics_manager' || rawRole === 'admin';
  const isCustomer = rawRole === 'customer';
  
  const activeRoleKey = isManager ? 'logistics_manager' : (isCustomer ? 'customer' : null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Invalid or missing role handling
  if (!activeRoleKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-6" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div className="max-w-md w-full bg-white rounded-3xl border border-red-200 shadow-2xl p-8 text-center space-y-4">
          <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl mx-auto flex items-center justify-center border border-red-100 shadow-sm">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Account Configuration Error</h2>
          <p className="text-xs text-gray-500 font-semibold leading-relaxed">
            Your account does not have a valid platform role. Please contact your administrator.
          </p>
          <button
            onClick={handleLogout}
            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white text-xs font-black rounded-xl shadow-lg shadow-red-600/20 cursor-pointer border-none transition-all duration-150 mt-2"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  const navGroups = ROLE_NAV_GROUPS[activeRoleKey] || [];

  // Find active label for breadcrumb / page indicator
  let currentActiveItem = null;
  for (const group of navGroups) {
    for (const item of group.items) {
      if (location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)) {
        currentActiveItem = item;
        break;
      }
    }
    if (currentActiveItem) break;
  }

  return (
    <div
      className="min-h-screen flex bg-[#f8fafc] text-gray-900 antialiased"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* ── MOBILE BACKDROP OVERLAY ─────────────────────────────────────── */}
      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 bg-slate-900/50 z-40 backdrop-blur-xs transition-opacity lg:hidden"
          aria-hidden="true"
        />
      )}

      {/* ── FIXED LEFT SIDEBAR (Desktop & Mobile Drawer) ─────────────────── */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col bg-white border-r border-gray-200/90 shadow-sm transition-all duration-300 ease-in-out ${
          isCollapsed ? 'lg:w-[76px]' : 'lg:w-[270px]'
        } ${
          isMobileOpen ? 'translate-x-0 w-[270px]' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* ── SIDEBAR HEADER / BRAND ───────────────────────────────────── */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-gray-100 shrink-0">
          <Link
            to={isManager ? '/manager/dashboard' : '/customer/dashboard'}
            className="no-underline flex items-center gap-3 overflow-hidden group"
          >
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shrink-0 shadow-md shadow-emerald-600/20 group-hover:scale-105 transition-transform">
              <Truck className="w-5 h-5 text-white" />
            </div>

            {(!isCollapsed || isMobileOpen) && (
              <div className="leading-tight truncate">
                <span className="text-sm font-black text-gray-900 tracking-tight block truncate">
                  Road Logistics Space
                </span>
                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest block truncate">
                  Dynamic Optimization
                </span>
              </div>
            )}
          </Link>

          {/* Desktop Collapse Toggle */}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden lg:flex w-7 h-7 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 items-center justify-center transition cursor-pointer border-none"
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            aria-label={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>

          {/* Mobile Drawer Close */}
          <button
            type="button"
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 flex items-center justify-center transition border-none cursor-pointer"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── SIDEBAR NAVIGATION ITEMS ─────────────────────────────────── */}
        <nav
          className="flex-1 overflow-y-auto py-4 px-3 space-y-6 scrollbar-thin scrollbar-thumb-gray-200"
          aria-label="Main Navigation"
        >
          {navGroups.map((group) => (
            <div key={group.groupLabel} className="space-y-1">
              {/* Group Section Header */}
              {(!isCollapsed || isMobileOpen) ? (
                <p className="px-3 text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1 select-none">
                  {group.groupLabel}
                </p>
              ) : (
                <div className="w-full border-t border-gray-100 my-2" />
              )}

              {/* Group Nav Items */}
              {group.items.map(({ label, path, icon: Icon }) => {
                const isActive = location.pathname === path || (path !== '/manager/dashboard' && path !== '/customer/dashboard' && location.pathname.startsWith(`${path}/`));

                return (
                  <Link
                    key={path}
                    to={path}
                    title={isCollapsed && !isMobileOpen ? label : undefined}
                    className={`no-underline flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 group relative ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-900 font-black shadow-xs'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/70'
                    } ${isCollapsed && !isMobileOpen ? 'justify-center px-0' : ''}`}
                  >
                    {/* Active Accent Indicator Bar */}
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-emerald-600 rounded-r-full" />
                    )}

                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isActive
                          ? 'text-emerald-600'
                          : 'text-gray-400 group-hover:text-gray-700'
                      }`}
                    />

                    {(!isCollapsed || isMobileOpen) && (
                      <span className="truncate">{label}</span>
                    )}

                    {/* Collapsed Tooltip on Hover */}
                    {isCollapsed && !isMobileOpen && (
                      <span className="pointer-events-none absolute left-full ml-3 px-2.5 py-1 bg-slate-900 text-white text-[11px] font-bold rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                        {label}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* ── SIDEBAR BOTTOM USER PROFILE & LOGOUT ───────────────────────── */}
        <div className="p-3 border-t border-gray-100 bg-gray-50/50 shrink-0 space-y-2">
          {/* User Badge */}
          <div
            className={`flex items-center gap-2.5 p-2 rounded-xl bg-white border border-gray-200/70 shadow-xs select-none ${
              isCollapsed && !isMobileOpen ? 'justify-center px-0' : ''
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-600/10 border border-emerald-600/20 flex items-center justify-center text-emerald-700 font-black text-xs shrink-0">
              {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
            </div>

            {(!isCollapsed || isMobileOpen) && (
              <div className="leading-tight truncate flex-1 min-w-0">
                <p className="text-xs font-black text-gray-900 truncate">
                  {user?.username || user?.name || 'User'}
                </p>
                <p className="text-[9px] font-black text-emerald-700 uppercase tracking-wider truncate">
                  {activeRoleKey === 'logistics_manager' ? 'LOGISTICS MANAGER' : 'CUSTOMER'}
                </p>
              </div>
            )}
          </div>

          {/* Logout Action */}
          <button
            type="button"
            onClick={handleLogout}
            title="Sign Out"
            className={`w-full py-2 px-3 rounded-xl bg-white hover:bg-red-50 hover:text-red-700 hover:border-red-200 text-gray-600 border border-gray-200/70 text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              isCollapsed && !isMobileOpen ? 'justify-center px-0' : ''
            }`}
          >
            <LogOut className="w-4 h-4 text-gray-400 hover:text-red-600 shrink-0" />
            {(!isCollapsed || isMobileOpen) && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT WRAPPER ────────────────────────────────────────── */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out ${
          isCollapsed ? 'lg:pl-[76px]' : 'lg:pl-[270px]'
        }`}
      >
        {/* ── CLEAN TOP HEADER BAR ──────────────────────────────────────── */}
        <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-xs border-b border-gray-200/80 px-4 sm:px-8 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Hamburger Toggle */}
            <button
              type="button"
              onClick={() => setIsMobileOpen(true)}
              className="lg:hidden p-2 rounded-xl text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition border-none cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Breadcrumb / Section Header */}
            <div className="flex items-center gap-2 truncate">
              <span className="hidden sm:inline-block text-xs font-semibold text-gray-400">
                {activeRoleKey === 'logistics_manager' ? 'Logistics Control Center' : 'Customer Portal'}
              </span>
              <span className="hidden sm:inline-block text-gray-300">/</span>
              <span className="text-xs sm:text-sm font-black text-gray-900 truncate">
                {currentActiveItem?.label || 'Overview'}
              </span>
            </div>
          </div>

          {/* Right Status Badge & Quick Info */}
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/80">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Operations Online
            </span>

            <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-xs font-black text-gray-700 md:hidden">
              {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
            </div>
          </div>
        </header>

        {/* ── MAIN CONTENT VIEWPORT ─────────────────────────────────────── */}
        <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default RoleLayout;
