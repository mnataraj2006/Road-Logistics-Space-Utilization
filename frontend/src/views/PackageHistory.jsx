import React, { useState, useEffect, useContext } from 'react';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';
import {
  Box, Calendar, Clock, MapPin, Search, Navigation, IndianRupee,
  CheckCircle2, RefreshCw, Compass, ArrowRight, ArrowDown, ChevronRight,
  ShieldCheck, Loader, Package, AlertCircle
} from 'lucide-react';

const formatINR = (v) => {
  if (v == null) return '₹0';
  return `₹${Math.round(v).toLocaleString('en-IN')}`;
};

const formatDateTime = (dtStr) => {
  if (!dtStr) return '—';
  const d = new Date(dtStr);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
};

const PackageHistory = () => {
  const { user } = useContext(AuthContext);
  const [bookings, setBookings] = useState([]);
  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('');

  const fetchBookings = async (showProgress = false) => {
    if (showProgress) setLoading(true);
    try {
      // Fetch all bookings. The backend filters automatically based on carrier/shipper user role.
      const { data } = await api.get('/bookings?limit=1000');
      setBookings(data);
      if (data.length > 0 && !selectedBookingId) {
        setSelectedBookingId(data[0].bookingId);
      }
    } catch (e) {
      console.error('Failed to load packages.', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings(true);
  }, []);

  const filteredBookings = bookings.filter(b => {
    const matchesSearch = b.bookingId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (b.fromStop && b.fromStop.toLowerCase().includes(searchQuery.toLowerCase())) ||
                          (b.toStop && b.toStop.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'ALL' || b.status.toUpperCase() === statusFilter.toUpperCase();
    const matchesDate = !dateFilter || new Date(b.date).toISOString().split('T')[0] === dateFilter;
    return matchesSearch && matchesStatus && matchesDate;
  });

  const selectedBooking = bookings.find(b => b.bookingId === selectedBookingId);

  return (
    <div className="space-y-6">
      
      {/* ── HEADER ────────────────────────────────────────────────── */}
      <div className="flex justify-between items-end flex-wrap gap-4 text-left">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <div className="h-[3px] w-5 bg-[#16a34a] rounded-full" />
            <span className="text-[10px] font-black text-[#16a34a] uppercase tracking-[0.18em]">Cargo Tracking</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Package Lifecycle & History</h1>
          <p className="text-[12px] text-gray-400 font-semibold mt-0.5">Track shipping milestones, LIFO segment placements, load/unload timestamps, and routes.</p>
        </div>

        <button onClick={() => fetchBookings(true)} className="w-10 h-10 bg-white border border-gray-100 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-50 cursor-pointer shadow-sm">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ── COCKPIT split pane layout ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[65vh] items-stretch">
        
        {/* LEFT COLUMN: Master Package selector (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between overflow-hidden">
          <div>
            {/* Search and filters header */}
            <div className="p-4 border-b border-gray-50 space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    placeholder="Search ID, stops..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 pl-10 pr-4 py-2.5 rounded-xl text-[12px] font-semibold focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none"
                  />
                </div>
                <div className="relative w-36 shrink-0">
                  <Calendar className="w-4 h-4 text-gray-400 absolute left-2.5 top-3" />
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 pl-9 pr-2 py-2.5 rounded-xl text-[11px] font-bold text-gray-700 focus:border-[#16a34a] focus:outline-none"
                  />
                  {dateFilter && (
                    <button 
                      onClick={() => setDateFilter('')}
                      className="absolute right-2 top-2.5 text-[9px] text-red-500 font-bold bg-transparent border-none cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Status pill selectors */}
              <div className="flex flex-wrap gap-1">
                {['ALL', 'PENDING', 'IN TRANSIT', 'COMPLETED', 'CANCELLED'].map(st => {
                  const active = statusFilter === st;
                  return (
                    <button
                      key={st}
                      onClick={() => setStatusFilter(st)}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black border uppercase tracking-wider cursor-pointer ${
                        active ? 'bg-[#16a34a] text-white border-[#16a34a]' : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'
                      }`}
                    >
                      {st}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Package entries list */}
            <div className="overflow-y-auto max-h-[50vh] p-4 space-y-2">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-2">
                  <Loader className="w-5 h-5 animate-spin text-[#16a34a]" />
                  <span className="text-[10px] text-gray-400 font-bold">Fetching shipments...</span>
                </div>
              ) : filteredBookings.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <Package className="w-8 h-8 text-gray-300 mx-auto" />
                  <p className="text-xs text-gray-400 italic">No packages found matching filter criteria.</p>
                </div>
              ) : (
                filteredBookings.map(b => {
                  const sel = b.bookingId === selectedBookingId;
                  return (
                    <div
                      key={b.bookingId}
                      onClick={() => setSelectedBookingId(b.bookingId)}
                      className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                        sel ? 'bg-green-50/20 border-[#16a34a]' : 'bg-transparent border-gray-100 hover:bg-gray-50/50'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="text-[12px] font-black text-gray-800">{b.bookingId}</span>
                          <span className="text-[9px] text-gray-400 font-bold block mt-0.5">{b.volume} m³ · {b.weight} kg</span>
                        </div>
                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full border ${
                          b.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' :
                          b.status === 'In Transit' ? 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse' :
                          b.status === 'Cancelled' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-100 text-gray-500 border-gray-200'
                        }`}>{b.status}</span>
                      </div>
                      <div className="flex items-center space-x-1.5 text-[10px] text-gray-500 font-bold">
                        <MapPin className="w-3.5 h-3.5 text-[#16a34a] shrink-0" />
                        <span className="truncate">{b.fromStop} ➔ {b.toStop}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* KPI bottom counter */}
          <div className="bg-gray-50 border-t border-gray-100 px-4.5 py-3 text-[10px] font-bold text-gray-400 text-left">
            Total bookings: <span className="text-gray-800 font-black">{filteredBookings.length}</span> items
          </div>
        </div>

        {/* RIGHT COLUMN: Sliding Lifecycle Timeline (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col justify-between overflow-hidden">
          
          {selectedBooking ? (
            <div className="space-y-6 text-left flex-1 flex flex-col justify-between">
              
              <div>
                {/* Panel Header */}
                <div className="flex justify-between items-start flex-wrap gap-4 pb-5 border-b border-gray-50">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h2 className="text-lg font-black text-gray-900">{selectedBooking.bookingId}</h2>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${
                        selectedBooking.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' :
                        selectedBooking.status === 'In Transit' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        selectedBooking.status === 'Cancelled' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-100 text-gray-500 border-gray-200'
                      }`}>{selectedBooking.status}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 font-semibold mt-1">
                      Carrier Lane Assignment: <span className="text-gray-700 font-black">{selectedBooking.routeId || 'UNASSIGNED'}</span> · Vehicle: <span className="text-gray-700 font-black">{selectedBooking.vehicleId || 'UNASSIGNED'}</span>
                    </p>
                  </div>

                  <div className="bg-green-50/50 border border-green-100 px-4 py-2 rounded-xl flex items-center space-x-2 text-right">
                    <div>
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Gross Yield</span>
                      <span className="text-sm font-black text-[#16a34a]">{formatINR(selectedBooking.revenue)}</span>
                    </div>
                    <IndianRupee className="w-5 h-5 text-[#16a34a]" />
                  </div>
                </div>

                {/* Package details cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-5 border-b border-gray-50">
                  {[
                    { label: 'Volume Space', value: `${selectedBooking.volume} m³`, sub: 'Occupancy' },
                    { label: 'Weight Load', value: `${selectedBooking.weight} kg`, sub: 'Total weight' },
                    { label: 'Pickup Point', value: selectedBooking.fromStop || 'Origin Depot', sub: 'Stop name' },
                    { label: 'Delivery Stop', value: selectedBooking.toStop || 'Terminal Depot', sub: 'Stop name' }
                  ].map(c => (
                    <div key={c.label} className="bg-gray-50 border border-gray-100 p-3.5 rounded-2xl">
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">{c.label}</span>
                      <span className="text-[11px] font-black text-gray-800 block truncate">{c.value}</span>
                      <span className="text-[8px] text-gray-400 font-bold uppercase mt-1 block">{c.sub}</span>
                    </div>
                  ))}
                </div>

                {/* Shipping Stop sequence path */}
                <div className="py-5 border-b border-gray-50">
                  <h3 className="text-[11px] font-black text-gray-900 uppercase tracking-widest mb-3.5">Assigned Transit Segment Stops</h3>
                  <div className="flex items-center space-x-2.5">
                    <div className="flex items-center space-x-1.5 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100 text-[11px] font-bold text-gray-700">
                      <MapPin className="w-3.5 h-3.5 text-[#16a34a]" />
                      <span>{selectedBooking.fromStop || 'Origin Depot'}</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-300" />
                    <div className="flex items-center space-x-1.5 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100 text-[11px] font-bold text-gray-700">
                      <MapPin className="w-3.5 h-3.5 text-[#16a34a]" />
                      <span>{selectedBooking.toStop || 'Destination Depot'}</span>
                    </div>
                  </div>
                </div>

                {/* Milestones Lifecycle Timeline */}
                <div className="py-5">
                  <h3 className="text-[11px] font-black text-gray-900 uppercase tracking-widest mb-4">Milestone Progression Timeline</h3>
                  <div className="space-y-6 relative pl-6 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[2px] before:bg-gray-100">
                    
                    {/* Milestone 1: Booking Created */}
                    <div className="relative">
                      <div className="absolute -left-[22px] top-1 w-3 h-3 rounded-full bg-green-600 border-2 border-white ring-4 ring-green-100" />
                      <div>
                        <h4 className="text-[11px] font-black text-gray-800">Booking Registered / Escrow Paid</h4>
                        <p className="text-[10px] text-gray-400 font-bold mt-0.5">{formatDateTime(selectedBooking.createdAt)}</p>
                      </div>
                    </div>

                    {/* Milestone 2: Package Loaded */}
                    <div className="relative">
                      <div className={`absolute -left-[22px] top-1 w-3 h-3 rounded-full border-2 border-white ${
                        selectedBooking.loadedAt 
                          ? 'bg-green-600 ring-4 ring-green-100' 
                          : selectedBooking.status === 'Cancelled'
                          ? 'bg-red-400'
                          : 'bg-gray-300'
                      }`} />
                      <div>
                        <h4 className="text-[11px] font-black text-gray-800">Loaded onto Truck at {selectedBooking.fromStop || 'Origin stop'}</h4>
                        <p className="text-[10px] text-gray-400 font-bold mt-0.5">
                          {selectedBooking.loadedAt ? formatDateTime(selectedBooking.loadedAt) : 'Pending transit segment launch'}
                        </p>
                      </div>
                    </div>

                    {/* Milestone 3: Package Delivered */}
                    <div className="relative">
                      <div className={`absolute -left-[22px] top-1 w-3 h-3 rounded-full border-2 border-white ${
                        selectedBooking.deliveredAt 
                          ? 'bg-green-600 ring-4 ring-green-100' 
                          : selectedBooking.status === 'Cancelled'
                          ? 'bg-red-400'
                          : 'bg-gray-300'
                      }`} />
                      <div>
                        <h4 className="text-[11px] font-black text-gray-800">Unloaded & Delivered at {selectedBooking.toStop || 'Terminal stop'}</h4>
                        <p className="text-[10px] text-gray-400 font-bold mt-0.5">
                          {selectedBooking.deliveredAt ? formatDateTime(selectedBooking.deliveredAt) : 'In transit segment progression'}
                        </p>
                      </div>
                    </div>

                  </div>
                </div>

              </div>

              {/* Status Note card */}
              <div className="bg-gray-50/70 border border-gray-150 p-4 rounded-2xl flex items-start space-x-3 mt-4">
                <AlertCircle className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <span className="text-[11px] font-black text-gray-800 block mb-0.5">Automated Segment Update Notice</span>
                  <span className="text-[9.5px] text-gray-400 font-semibold leading-relaxed block">
                    milestone times are computed dynamically based on the dispatch truck's trip start time combined with segment distance timings. No manual barcode scanning is required.
                  </span>
                </div>
              </div>

            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 space-y-2">
              <Package className="w-10 h-10 text-gray-300" />
              <p className="text-gray-400 italic text-center">Select a package shipment from the master list to inspect lifecycle milestones.</p>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};

export default PackageHistory;
