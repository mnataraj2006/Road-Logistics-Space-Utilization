import React, { useState, useEffect, useContext } from 'react';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';
import { 
  Search, Truck, Clock, IndianRupee, 
  CheckCircle, Info, Sparkles, Navigation, ArrowRight, MapPin, AlertCircle,
  X, FileText, Package, CreditCard, ShieldCheck, RefreshCw, Layers, ChevronDown, ChevronUp
} from 'lucide-react';

const formatINR = (v) => (v != null ? `₹${Math.round(v).toLocaleString('en-IN')}` : '₹0');

const MarketplaceSearch = () => {
  const { user } = useContext(AuthContext);

  // Search parameters
  const [pickup, setPickup] = useState('Chennai');
  const [delivery, setDelivery] = useState('Salem');
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate());
    return d.toISOString().split('T')[0];
  });
  const [volume, setVolume] = useState(10);
  const [weight, setWeight] = useState(2000);
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [cargoDescription, setCargoDescription] = useState('Industrial components');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceValue, setInvoiceValue] = useState('');

  // Dropdown options
  const [availableCities, setAvailableCities] = useState([]);

  // Search state
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchResponse, setSearchResponse] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const [expandedTruckId, setExpandedTruckId] = useState(null);

  // Booking Modal state
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState(null);
  const [bookingReceipt, setBookingReceipt] = useState(null);

  // Load available route stops on initial mount
  useEffect(() => {
    api.get('/routes')
      .then(res => {
        const routesList = res.data || [];
        const citiesSet = new Set();
        routesList.forEach(r => {
          if (r.stops && r.stops.length > 0) {
            r.stops.forEach(s => citiesSet.add(s.trim()));
          } else if (r.source && r.destination) {
            citiesSet.add(r.source.trim());
            citiesSet.add(r.destination.trim());
          }
        });
        const sortedCities = Array.from(citiesSet).sort();
        setAvailableCities(sortedCities);
        if (sortedCities.length > 1) {
          setPickup(sortedCities[0]);
          setDelivery(sortedCities[1]);
        }
      })
      .catch(err => console.error('Failed to load cities:', err));
  }, []);

  // Perform search against segment capacity engine
  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setSearchError(null);
    setSearchResponse(null);
    setHasSearched(true);

    try {
      const res = await api.get('/capacity/search', {
        params: {
          pickup,
          delivery,
          date,
          volume,
          weight,
          length: length || 0,
          width: width || 0,
          height: height || 0
        }
      });
      setSearchResponse(res.data);
    } catch (err) {
      console.error('Capacity search error:', err);
      setSearchError(err.response?.data?.message || 'Failed to search available space. Please check parameters.');
    } finally {
      setLoading(false);
    }
  };

  // Open booking confirmation modal
  const openBookingModal = (match) => {
    setSelectedMatch(match);
    setBookingError(null);
    setShowBookingModal(true);
  };

  // Execute atomic transactional booking
  const handleConfirmBooking = async (e) => {
    e.preventDefault();
    if (!selectedMatch) return;

    setBookingSubmitting(true);
    setBookingError(null);

    try {
      const res = await api.post('/capacity/book', {
        vehicleId: selectedMatch.vehicleId,
        routeId: selectedMatch.route.routeId,
        pickup,
        delivery,
        date,
        volume: parseFloat(volume),
        weight: parseFloat(weight),
        length: parseFloat(length) || 0,
        width: parseFloat(width) || 0,
        height: parseFloat(height) || 0,
        cargoDescription,
        invoiceNumber,
        invoiceValue: parseFloat(invoiceValue) || 0
      });

      setBookingReceipt(res.data);
      setShowBookingModal(false);
      // Refresh search results to show updated remaining capacity
      handleSearch();
    } catch (err) {
      console.error('Booking failed:', err);
      setBookingError(err.response?.data?.message || 'Reservation failed due to capacity conflict. Please choose another vehicle.');
    } finally {
      setBookingSubmitting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 bg-[#f8fafc]">
      {/* ── HEADER ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <span className="bg-emerald-50 text-[#16a34a] text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-emerald-100">
              Customer Space Reservation
            </span>
            <span className="text-[10px] font-bold text-gray-400">Multi-Stop Segment Availability</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight mt-1">
            Dynamic Truck-Space Marketplace
          </h1>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">
            Search guaranteed segment-by-segment capacity, check real-time fill rates, and book instantly with escrow security.
          </p>
        </div>
      </div>

      {/* ── SEARCH FILTER CARD ──────────────────────────────────── */}
      <form onSubmit={handleSearch} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center space-x-2 text-gray-800 text-sm font-black uppercase tracking-wider">
            <Search className="w-4 h-4 text-[#16a34a]" />
            <span>Search Segment Capacity</span>
          </div>
          <span className="text-[11px] text-gray-400 font-semibold">Strict Segment-Level Verification</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Pickup Stop */}
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
              Pickup Stop
            </label>
            <div className="relative">
              <MapPin className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                list="pickup-cities"
                value={pickup}
                onChange={e => setPickup(e.target.value)}
                required
                placeholder="e.g. Chennai"
                className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-xs font-semibold text-gray-900"
              />
              <datalist id="pickup-cities">
                {availableCities.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>

          {/* Delivery Stop */}
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
              Delivery Stop
            </label>
            <div className="relative">
              <Navigation className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                list="delivery-cities"
                value={delivery}
                onChange={e => setDelivery(e.target.value)}
                required
                placeholder="e.g. Madurai"
                className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-xs font-semibold text-gray-900"
              />
              <datalist id="delivery-cities">
                {availableCities.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>

          {/* Shipment Date */}
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
              Dispatch Date
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-xs font-semibold text-gray-900"
            />
          </div>

          {/* Required Volume */}
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
              Volume (m³)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={volume}
              onChange={e => setVolume(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-xs font-semibold text-gray-900"
            />
          </div>

          {/* Required Weight */}
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
              Weight (kg)
            </label>
            <input
              type="number"
              min="1"
              value={weight}
              onChange={e => setWeight(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-xs font-semibold text-gray-900"
            />
          </div>
        </div>

        {/* Optional Dimensions Accordion */}
        <div className="pt-2 grid grid-cols-1 sm:grid-cols-4 gap-4 border-t border-gray-50">
          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block mb-1">
              Length (m) (Optional)
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="e.g. 2.5"
              value={length}
              onChange={e => setLength(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-700"
            />
          </div>
          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block mb-1">
              Width (m) (Optional)
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="e.g. 1.2"
              value={width}
              onChange={e => setWidth(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-700"
            />
          </div>
          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block mb-1">
              Height (m) (Optional)
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="e.g. 1.5"
              value={height}
              onChange={e => setHeight(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-700"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#16a34a] hover:bg-[#15803d] text-white font-black rounded-xl text-xs shadow-md shadow-green-600/20 border-none cursor-pointer flex items-center justify-center space-x-2 transition-all"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              <span>FIND AVAILABLE TRUCK SPACE</span>
            </button>
          </div>
        </div>
      </form>

      {/* ── SEARCH ERROR ALERT ─────────────────────────────────── */}
      {searchError && (
        <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-start space-x-3 text-red-600 text-xs font-semibold">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Search Evaluation Error</p>
            <p className="mt-0.5">{searchError}</p>
          </div>
        </div>
      )}

      {/* ── BOOKING RECEIPT BANNER ─────────────────────────────── */}
      {bookingReceipt && (
        <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-3xl space-y-4 shadow-sm animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
            <div className="flex items-center space-x-2 text-[#16a34a]">
              <CheckCircle className="w-6 h-6" />
              <div>
                <h3 className="text-base font-black text-gray-900">Space Reserved & Booking Confirmed!</h3>
                <span className="text-xs text-[#16a34a] font-bold">Booking ID: {bookingReceipt.booking?.bookingId}</span>
              </div>
            </div>
            <button
              onClick={() => setBookingReceipt(null)}
              className="text-gray-400 hover:text-gray-600 border-none bg-transparent cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-semibold text-gray-700">
            <div><span className="text-gray-400 block text-[10px] font-black uppercase">Shipment ID</span>{bookingReceipt.shipment?.shipmentId}</div>
            <div><span className="text-gray-400 block text-[10px] font-black uppercase">Assigned Truck</span>{bookingReceipt.booking?.vehicleId}</div>
            <div><span className="text-gray-400 block text-[10px] font-black uppercase">Route Segment</span>{bookingReceipt.booking?.fromStop} ➔ {bookingReceipt.booking?.toStop}</div>
            <div><span className="text-gray-400 block text-[10px] font-black uppercase">Payment Escrow</span>{formatINR(bookingReceipt.payment?.amount)} (Escrow Held)</div>
          </div>
        </div>
      )}

      {/* ── SEARCH RESULTS CONTAINER ───────────────────────────── */}
      {hasSearched && !loading && (
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-black text-gray-900">Available Truck Matches</h2>
              <span className="bg-gray-100 text-gray-700 text-[11px] font-black px-2.5 py-0.5 rounded-full">
                {searchResponse?.matchedTrucksCount || 0} Options Found
              </span>
            </div>
            <span className="text-xs text-gray-400 font-semibold">
              Ranked by Space Fit & Minimum Deadhead Capacity
            </span>
          </div>

          {searchResponse?.results?.length === 0 ? (
            <div className="bg-white rounded-3xl border border-gray-100 p-12 text-center space-y-3 shadow-sm">
              <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-gray-800">No Vehicles Meet Segment Capacity Constraints</h3>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                There are no active trucks on the lane serving <strong>{pickup} ➔ {delivery}</strong> with at least <strong>{volume} m³</strong> and <strong>{weight} kg</strong> free capacity across all occupied hops on {date}.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {searchResponse?.results?.map((match) => {
                const isExpanded = expandedTruckId === match.vehicleId;
                return (
                  <div
                    key={match.vehicleId}
                    className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all space-y-5"
                  >
                    {/* Top Row: Vehicle ID, Carrier, Segment Hop, Fit Score, Price */}
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-gray-50 pb-4">
                      <div className="flex items-center space-x-3.5">
                        <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-[#16a34a]">
                          <Truck className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-base font-black text-gray-900">{match.vehicleId}</span>
                            <span className="text-[10px] font-black uppercase bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md">
                              {match.vehicleType}
                            </span>
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                              Fit Score: {match.fitScore}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500 font-semibold mt-0.5 block">
                            Carrier: {match.carrierId} • Base: {match.baseLocation} • Lane: {match.route.source} ➔ {match.route.destination} ({match.route.totalDistanceKm} KM)
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-6">
                        <div className="text-right">
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Estimated Price</span>
                          <span className="text-xl font-black text-gray-900">{formatINR(match.estimatedPrice)}</span>
                          <span className="text-[9px] text-[#16a34a] font-bold block">Dynamic Yield Optimized</span>
                        </div>
                        <button
                          onClick={() => openBookingModal(match)}
                          className="px-5 py-3 bg-[#16a34a] hover:bg-[#15803d] text-white font-black rounded-2xl text-xs shadow-md shadow-green-600/20 border-none cursor-pointer flex items-center space-x-1.5 transition-all"
                        >
                          <span>BOOK SPACE</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Middle Row: Segment Span Metrics & Capacity Indicators */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-50/60 p-4 rounded-2xl border border-gray-100 text-xs">
                      <div>
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                          Requested Segment Hop
                        </span>
                        <div className="font-black text-gray-800 flex items-center space-x-1">
                          <span>{match.segmentSpan.pickup}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-[#16a34a]" />
                          <span>{match.segmentSpan.delivery}</span>
                        </div>
                        <span className="text-[10px] text-gray-400 font-semibold">{match.route.occupiedDistanceKm} KM ({match.segmentSpan.hopsCount} hops)</span>
                      </div>

                      <div>
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                          Remaining Free Space on Span
                        </span>
                        <div className="font-bold text-gray-800">
                          <span className="font-black text-emerald-600">{match.availableVolume} m³</span> / {match.capacityVolume} m³
                        </div>
                        <span className="text-[10px] text-gray-500 font-semibold">{match.availableWeight} kg remaining</span>
                      </div>

                      <div>
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                          Segment Fill Rate (Before ➔ After)
                        </span>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-gray-600">{match.utilizationBefore.volumePercent}%</span>
                          <ArrowRight className="w-3 h-3 text-gray-400" />
                          <span className="font-black text-[#16a34a]">{match.utilizationAfter.volumePercent}% Vol</span>
                        </div>
                        <div className="w-full bg-gray-200 h-1.5 rounded-full mt-1.5 overflow-hidden">
                          <div
                            className="bg-[#16a34a] h-full rounded-full transition-all"
                            style={{ width: `${Math.min(match.utilizationAfter.volumePercent, 100)}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => setExpandedTruckId(isExpanded ? null : match.vehicleId)}
                          className="px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 font-bold text-xs cursor-pointer flex items-center space-x-1.5 transition-all"
                        >
                          <Layers className="w-3.5 h-3.5 text-gray-500" />
                          <span>{isExpanded ? 'Hide Segment Details' : 'Inspect All Route Legs'}</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Bottom Row: Detailed Route Segment Breakdown (Expander) */}
                    {isExpanded && (
                      <div className="pt-2 border-t border-gray-100 space-y-3 animate-in fade-in">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-gray-700 uppercase tracking-wider">
                            Route Segment-by-Segment Capacity Profile
                          </span>
                          <span className="text-[10px] text-gray-400">Green highlights denote segments occupied by your cargo</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {match.allSegments.map((seg, sIdx) => (
                            <div
                              key={sIdx}
                              className={`p-3.5 rounded-2xl border text-xs space-y-1.5 ${
                                seg.isOccupiedByRequest
                                  ? 'bg-emerald-50/70 border-emerald-200'
                                  : 'bg-gray-50 border-gray-100'
                              }`}
                            >
                              <div className="flex justify-between items-center font-black">
                                <span className="text-gray-900">{seg.fromStop} ➔ {seg.toStop}</span>
                                {seg.isOccupiedByRequest && (
                                  <span className="bg-[#16a34a] text-white text-[9px] font-black px-1.5 py-0.5 rounded">
                                    OCCUPIED
                                  </span>
                                )}
                              </div>
                              <div className="flex justify-between text-[11px] text-gray-600 font-semibold">
                                <span>Volume Used: {seg.usedVolumeBefore} m³</span>
                                <span className="font-bold text-emerald-700">{seg.remainingVolume} m³ free</span>
                              </div>
                              <div className="flex justify-between text-[11px] text-gray-600 font-semibold">
                                <span>Weight Used: {seg.usedWeightBefore} kg</span>
                                <span className="font-bold text-emerald-700">{seg.remainingWeight} kg free</span>
                              </div>
                              <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${seg.isOccupiedByRequest ? 'bg-[#16a34a]' : 'bg-gray-400'}`}
                                  style={{ width: `${Math.min(seg.isOccupiedByRequest ? seg.volumeUtilAfter : seg.volumeUtilBefore, 100)}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL: CONFIRM BOOKING RESERVATION ─────────────────── */}
      {showBookingModal && selectedMatch && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-2xl max-w-lg w-full p-6 text-left space-y-5">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="flex items-center space-x-2 text-[#16a34a]">
                <ShieldCheck className="w-6 h-6" />
                <div>
                  <h3 className="text-base font-black text-gray-900">Confirm Space Reservation</h3>
                  <span className="text-[10px] text-gray-400 font-semibold">Truck {selectedMatch.vehicleId} • {pickup} ➔ {delivery}</span>
                </div>
              </div>
              <button
                onClick={() => setShowBookingModal(false)}
                className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100 border-none cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {bookingError && (
              <div className="bg-red-50 border border-red-100 p-3.5 rounded-2xl text-red-600 text-xs font-semibold flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{bookingError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmBooking} className="space-y-4 text-xs font-semibold text-gray-700">
              <div className="bg-gray-50 p-4 rounded-2xl space-y-2 border border-gray-100 text-xs">
                <div className="flex justify-between font-black text-gray-900">
                  <span>Selected Lane:</span>
                  <span>{pickup} ➔ {delivery}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Cargo Space:</span>
                  <span>{volume} m³ • {weight} kg</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Scheduled Date:</span>
                  <span>{date}</span>
                </div>
                <div className="flex justify-between text-gray-900 font-black text-sm pt-2 border-t border-gray-200">
                  <span>Total Commercial Price:</span>
                  <span className="text-[#16a34a]">{formatINR(selectedMatch.estimatedPrice)}</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                  Cargo Description
                </label>
                <input
                  type="text"
                  value={cargoDescription}
                  onChange={e => setCargoDescription(e.target.value)}
                  placeholder="e.g. 5 Cartons Automotive Spare Parts"
                  required
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-xs font-semibold text-gray-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                    Invoice Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={e => setInvoiceNumber(e.target.value)}
                    placeholder="INV-2026-001"
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-900"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                    Invoice Value (₹)
                  </label>
                  <input
                    type="number"
                    value={invoiceValue}
                    onChange={e => setInvoiceValue(e.target.value)}
                    placeholder="50000"
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-900"
                  />
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl text-[10px] text-emerald-800 font-semibold">
                🔒 Protected by Escrow: Payment is securely authorized and held in platform escrow until driver verifies physical delivery at {delivery}.
              </div>

              <button
                type="submit"
                disabled={bookingSubmitting}
                className="w-full py-3.5 bg-[#16a34a] hover:bg-[#15803d] text-white font-black rounded-xl text-xs shadow-lg shadow-green-600/20 border-none cursor-pointer flex items-center justify-center space-x-2 transition-all"
              >
                {bookingSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4" />
                )}
                <span>CONFIRM & AUTHORIZE BOOKING</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketplaceSearch;
