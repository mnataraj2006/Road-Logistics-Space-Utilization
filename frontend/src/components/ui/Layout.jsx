import React, { useState, useEffect, useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import api from '../../services/api';
import { 
  X, 
  Search, 
  Bell, 
  Plus, 
  LogOut, 
  User, 
  BrainCircuit, 
  Truck,
  Navigation,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';

const CUSTOMERS = [
  { id: 'CUST-001', name: 'Apex Retail Group (Enterprise)' },
  { id: 'CUST-002', name: 'Global Manufacturing (Enterprise)' },
  { id: 'CUST-003', name: 'Pacific Organic Foods (Enterprise)' },
  { id: 'CUST-004', name: 'West Coast Distributors (SMB)' },
  { id: 'CUST-005', name: 'BioTech Solutions (SMB)' },
  { id: 'CUST-006', name: 'Local Artisan Crafts (SMB)' }
];

const Layout = ({ children }) => {
  const { user, logout } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();

  // Modals Visibility
  const [isAddVehicleOpen, setIsAddVehicleOpen] = useState(false);
  const [isNewBookingOpen, setIsNewBookingOpen] = useState(false);

  // Reference Data for Forms
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);

  // Add Vehicle Form State
  const [newVehicleId, setNewVehicleId] = useState('');
  const [newType, setNewType] = useState('Heavy Truck');
  const [newVolume, setNewVolume] = useState(100);
  const [newWeight, setNewWeight] = useState(20000);
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  // New Booking Form State
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('CUST-001');
  const [selectedRoute, setSelectedRoute] = useState('');
  const [bookingVolume, setBookingVolume] = useState(10);
  const [bookingWeight, setBookingWeight] = useState(2000);
  const [bookingError, setBookingError] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);

  // Load Reference Data
  const fetchReferenceData = async () => {
    try {
      const [vRes, rRes] = await Promise.all([
        api.get('/vehicles'),
        api.get('/routes')
      ]);
      setVehicles(vRes.data);
      setRoutes(rRes.data);
      if (vRes.data.length > 0) setSelectedVehicle(vRes.data[0].vehicleId);
      if (rRes.data.length > 0) setSelectedRoute(rRes.data[0].routeId);
    } catch (err) {
      console.error('Error fetching reference data:', err);
    }
  };

  useEffect(() => {
    fetchReferenceData();
  }, [isNewBookingOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleAddVehicle = async (e) => {
    e.preventDefault();
    setAddLoading(true);
    setAddError('');
    try {
      await api.post('/vehicles', {
        vehicleId: newVehicleId,
        type: newType,
        capacityVolume: newVolume,
        capacityWeight: newWeight
      });
      setIsAddVehicleOpen(false);
      setNewVehicleId('');
      setAddLoading(false);
      window.location.reload(); // Refresh the active view
    } catch (err) {
      console.error('Error adding vehicle:', err);
      setAddError(err.response?.data?.message || 'Failed to add vehicle to fleet.');
      setAddLoading(false);
    }
  };

  const handleNewBooking = async (e) => {
    e.preventDefault();
    setBookingLoading(true);
    setBookingError('');
    try {
      await api.post('/bookings', {
        date: bookingDate,
        vehicleId: selectedVehicle,
        customerId: selectedCustomer,
        routeId: selectedRoute,
        volume: bookingVolume,
        weight: bookingWeight,
        status: new Date(bookingDate) > new Date() ? 'Pending' : 'Completed'
      });
      setIsNewBookingOpen(false);
      setBookingLoading(false);
      window.location.reload(); // Refresh the active view
    } catch (err) {
      console.error('Error creating booking:', err);
      setBookingError(err.response?.data?.message || 'Failed to record consignment booking.');
      setBookingLoading(false);
    }
  };

  const navItems = user?.role === 'shipper'
    ? [
        { name: 'Find Cargo Space', path: '/' },
        { name: 'My Shipments', path: '/shipments' },
        { name: 'Payment Invoices', path: '/payments' },
      ]
    : [
        { name: 'Fleet Summary', path: '/' },
        { name: 'Route Analytics', path: '/routes' },
        { name: 'Space & Occupancy', path: '/space' },
        { name: 'ML Forecasting', path: '/predictions' },
      ];

  return (
    <div className="min-h-screen bg-[#080914] text-slate-100 flex flex-col font-sans">
      {/* Top Main Header */}
      <header className="border-b border-white/5 bg-[#0b0c16]/85 backdrop-blur-md px-8 py-4 flex items-center justify-between shrink-0 z-20">
        {/* Brand Logo & Name */}
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#3b46cf] flex items-center justify-center shadow-lg shadow-indigo-600/30">
            <Truck className="w-5.5 h-5.5 text-white" />
          </div>
          <div>
            <h1 className="font-extrabold text-lg text-white tracking-wide leading-tight">Cargolytics</h1>
            <p className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase">Road Logistics • Space & Business Intelligence</p>
          </div>
        </div>

        {/* Middle Search Input */}
        <div className="hidden md:flex items-center w-full max-w-md relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-4" />
          <input 
            type="text" 
            placeholder="Search consignments, vehicles..." 
            className="w-full bg-[#131427]/60 border border-white/5 pl-11 pr-4 py-2.5 rounded-xl text-xs font-medium placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:bg-[#131427]/90 transition-all duration-200 text-slate-200"
          />
        </div>

        {/* Right Controls */}
        <div className="flex items-center space-x-5">
          {/* Notification bell */}
          <button className="relative w-10 h-10 rounded-xl bg-[#131427] border border-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-colors duration-150">
            <Bell className="w-4.5 h-4.5" />
            <span className="absolute top-3 right-3 w-2 h-2 bg-indigo-500 rounded-full"></span>
          </button>

          {/* User profile dropdown info */}
          <div className="hidden lg:flex items-center space-x-3 bg-[#131427] border border-white/5 px-4 py-1.5 rounded-xl">
            <div className="w-7.5 h-7.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <User className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-white leading-tight">{user?.username || 'Admin User'}</p>
              <span className="text-[9px] font-semibold text-indigo-400 uppercase tracking-wider">{user?.role || 'Carrier'}</span>
            </div>
          </div>

          {/* Core Action Buttons (Only visible to non-shippers) */}
          {user?.role !== 'shipper' && (
            <>
              <button 
                onClick={() => setIsAddVehicleOpen(true)}
                className="hidden sm:flex items-center space-x-2 px-4 py-2.5 rounded-xl border border-white/10 hover:bg-[#131427] text-slate-200 text-xs font-bold transition-all duration-200 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Vehicle</span>
              </button>

              <button 
                onClick={() => setIsNewBookingOpen(true)}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-[#3b46cf] hover:bg-[#2d37bf] text-white text-xs font-bold shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30 transition-all duration-200 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>New Booking</span>
              </button>
            </>
          )}

          {/* Sign out */}
          <button 
            onClick={handleLogout}
            title="Sign Out"
            className="w-10 h-10 rounded-xl bg-[#131427] border border-white/5 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 flex items-center justify-center text-slate-400 transition-all duration-200 cursor-pointer"
          >
            <LogOut className="w-4.5 h-4.5" />
          </button>
        </div>
      </header>

      {/* Sub-Header Horizontal Tab Menu */}
      <div className="px-8 py-4 bg-[#0b0c16] border-b border-white/5 shrink-0 z-10">
        <div className="flex space-x-1.5 bg-[#111224]/80 p-1.5 rounded-2xl border border-white/5 max-w-2xl shadow-inner">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex-1 text-center py-2.5 rounded-xl text-xs font-bold tracking-wide transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-[#3b46cf] text-white shadow-md shadow-indigo-600/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#131427]/60'
                }`}
              >
                {item.name}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-8 bg-[#080914] relative z-0">
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
          {children}
        </div>
      </main>

      {/* GLOBAL MODALS */}

      {/* 1. Add Vehicle Modal */}
      {isAddVehicleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass-panel w-full max-w-md p-6 rounded-2xl border-white/5 shadow-2xl animate-in zoom-in-95 duration-200 text-slate-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-base font-extrabold text-white tracking-wide">Add New Fleet Vehicle</h2>
              <button 
                onClick={() => setIsAddVehicleOpen(false)}
                className="w-8 h-8 rounded-lg bg-[#131427] flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-white transition-colors duration-150"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {addError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-4 py-2.5 rounded-xl mb-4 flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{addError}</span>
              </div>
            )}

            <form onSubmit={handleAddVehicle} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-400 mb-1.5 uppercase tracking-wider text-[10px]">Vehicle Registration / ID</label>
                <input 
                  type="text" 
                  value={newVehicleId} 
                  onChange={(e) => setNewVehicleId(e.target.value)}
                  placeholder="e.g. TN-09-HT-1204" 
                  required
                  className="w-full bg-[#131427] border border-white/5 p-3 rounded-xl focus:outline-none focus:border-indigo-500 text-white placeholder-slate-600"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1.5 uppercase tracking-wider text-[10px]">Truck Type / Size</label>
                <select 
                  value={newType} 
                  onChange={(e) => {
                    setNewType(e.target.value);
                    if (e.target.value === 'Heavy Truck') {
                      setNewVolume(100);
                      setNewWeight(20000);
                    } else if (e.target.value === 'Medium Truck') {
                      setNewVolume(50);
                      setNewWeight(10000);
                    } else {
                      setNewVolume(15);
                      setNewWeight(3000);
                    }
                  }}
                  className="w-full bg-[#131427] border border-white/5 p-3 rounded-xl focus:outline-none focus:border-indigo-500 text-white"
                >
                  <option value="Heavy Truck">Heavy Truck (100 m³ / 20t)</option>
                  <option value="Medium Truck">Medium Truck (50 m³ / 10t)</option>
                  <option value="Light Van">Light Van (15 m³ / 3t)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1.5 uppercase tracking-wider text-[10px]">Max Volume (m³)</label>
                  <input 
                    type="number" 
                    value={newVolume} 
                    onChange={(e) => setNewVolume(parseFloat(e.target.value))}
                    required
                    className="w-full bg-[#131427] border border-white/5 p-3 rounded-xl focus:outline-none focus:border-indigo-500 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1.5 uppercase tracking-wider text-[10px]">Max Weight (kg)</label>
                  <input 
                    type="number" 
                    value={newWeight} 
                    onChange={(e) => setNewWeight(parseInt(e.target.value))}
                    required
                    className="w-full bg-[#131427] border border-white/5 p-3 rounded-xl focus:outline-none focus:border-indigo-500 text-white"
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={addLoading}
                className="w-full bg-[#3b46cf] hover:bg-[#2d37bf] py-3 rounded-xl font-bold text-white shadow-lg shadow-indigo-600/10 cursor-pointer mt-2"
              >
                {addLoading ? 'Adding vehicle...' : 'Add Vehicle to Fleet'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 2. New Booking Modal */}
      {isNewBookingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass-panel w-full max-w-lg p-6 rounded-2xl border-white/5 shadow-2xl animate-in zoom-in-95 duration-200 text-slate-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-base font-extrabold text-white tracking-wide">Log New Cargo Booking</h2>
              <button 
                onClick={() => setIsNewBookingOpen(false)}
                className="w-8 h-8 rounded-lg bg-[#131427] flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-white transition-colors duration-150"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {bookingError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-4 py-2.5 rounded-xl mb-4 flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{bookingError}</span>
              </div>
            )}

            <form onSubmit={handleNewBooking} className="space-y-4 text-xs font-semibold">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1.5 uppercase tracking-wider text-[10px]">Dispatch Date</label>
                  <input 
                    type="date" 
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    required
                    className="w-full bg-[#131427] border border-white/5 p-3 rounded-xl focus:outline-none focus:border-indigo-500 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1.5 uppercase tracking-wider text-[10px]">Customer Segment</label>
                  <select 
                    value={selectedCustomer} 
                    onChange={(e) => setSelectedCustomer(e.target.value)}
                    className="w-full bg-[#131427] border border-white/5 p-3 rounded-xl focus:outline-none focus:border-indigo-500 text-white font-medium"
                  >
                    {CUSTOMERS.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1.5 uppercase tracking-wider text-[10px]">Route Shipping Lane</label>
                  <select 
                    value={selectedRoute} 
                    onChange={(e) => setSelectedRoute(e.target.value)}
                    className="w-full bg-[#131427] border border-white/5 p-3 rounded-xl focus:outline-none focus:border-indigo-500 text-white"
                  >
                    {routes.map(r => (
                      <option key={r.routeId} value={r.routeId}>{r.routeId} • {r.source} → {r.destination}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1.5 uppercase tracking-wider text-[10px]">Assigned Vehicle</label>
                  <select 
                    value={selectedVehicle} 
                    onChange={(e) => setSelectedVehicle(e.target.value)}
                    className="w-full bg-[#131427] border border-white/5 p-3 rounded-xl focus:outline-none focus:border-indigo-500 text-white"
                  >
                    {vehicles.map(v => (
                      <option key={v.vehicleId} value={v.vehicleId}>{v.vehicleId} ({v.type})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4">
                <div>
                  <label className="block text-slate-400 mb-1.5 uppercase tracking-wider text-[10px]">Cargo Volume (m³)</label>
                  <input 
                    type="number" 
                    value={bookingVolume} 
                    onChange={(e) => setBookingVolume(parseFloat(e.target.value))}
                    required
                    min="0.1"
                    step="0.1"
                    className="w-full bg-[#131427] border border-white/5 p-3 rounded-xl focus:outline-none focus:border-indigo-500 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1.5 uppercase tracking-wider text-[10px]">Cargo Weight (kg)</label>
                  <input 
                    type="number" 
                    value={bookingWeight} 
                    onChange={(e) => setBookingWeight(parseInt(e.target.value))}
                    required
                    min="1"
                    className="w-full bg-[#131427] border border-white/5 p-3 rounded-xl focus:outline-none focus:border-indigo-500 text-white"
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={bookingLoading}
                className="w-full bg-[#3b46cf] hover:bg-[#2d37bf] py-3 rounded-xl font-bold text-white shadow-lg shadow-indigo-600/10 cursor-pointer mt-2"
              >
                {bookingLoading ? 'Booking consignment...' : 'Log Booking Transaction'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
