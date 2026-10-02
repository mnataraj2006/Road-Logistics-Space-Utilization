import React, { useState, useEffect, useContext } from 'react';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';
import { 
  Truck, CheckCircle2, Clock, QrCode, 
  MapPin, AlertCircle, Play, 
  Sparkles, CheckCircle, Info, RefreshCw, Layers
} from 'lucide-react';

const formatINR = (value) => {
  if (value === undefined || value === null) return '₹0';
  return `₹${value.toLocaleString('en-IN')}`;
};

const DriverDashboard = () => {
  const { user } = useContext(AuthContext);

  const [vehicle, setVehicle] = useState(null);
  const [route, setRoute] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  
  const [scanToken, setScanToken] = useState('');
  const [showQRModal, setShowQRModal] = useState(null);

  const fetchTripData = async () => {
    try {
      setError(null);
      const res = await api.get('/vehicles/driver/active-trip');
      
      if (res.data && res.data.vehicle) {
        setVehicle(res.data.vehicle);
        setRoute(res.data.route);
        setBookings(res.data.bookings || []);
        
        // Fetch recommendations for this vehicle
        try {
          const recRes = await api.get(`/vehicles/${res.data.vehicle.vehicleId}/recommendations`);
          setRecommendations(recRes.data.recommendations || []);
        } catch (recErr) {
          console.error(recErr);
        }
      } else {
        setVehicle(null);
        setRoute(null);
        setBookings([]);
        setRecommendations([]);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to fetch active trip information.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTripData();
  }, []);

  const handleStartTrip = async () => {
    if (!vehicle) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/vehicles/${vehicle.vehicleId}/transit-state`, {
        action: 'start-trip'
      });
      setSuccessMsg("Trip started successfully! All initial cargo is now In Transit.");
      fetchTripData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to start trip.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyQR = async (tokenToVerify, stopIdToVerify) => {
    if (!vehicle) return;
    const token = tokenToVerify || scanToken;
    const stopId = stopIdToVerify || expectedStop?.stopId;
    if (!token) {
      setError("Please enter or select a stop QR token to verify.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const { data } = await api.post(`/vehicles/${vehicle.vehicleId}/verify-stop`, {
        qrToken: token,
        stopId: stopId
      });
      setSuccessMsg(data.message);
      setScanToken('');
      fetchTripData();
    } catch (err) {
      setError(err.response?.data?.message || 'Verification failed. Double check your token sequence.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#16a34a] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-black text-gray-900">Good morning, {user?.name || user?.username}</h1>
            <p className="text-[11px] text-gray-400 font-semibold mt-0.5">Driver Portal Dashboard</p>
          </div>
          <button 
            onClick={fetchTripData}
            className="w-9 h-9 rounded-xl bg-white border border-gray-100 hover:bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors cursor-pointer shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-10 text-center max-w-lg mx-auto mt-8 space-y-4">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-450">
            <Truck className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-black text-gray-900">No Active Trip Assigned</h3>
            <p className="text-[12px] text-gray-450 font-semibold leading-relaxed max-w-sm mx-auto">
              You currently have no active trip. Your carrier will assign a vehicle and dispatch a trip lane for you when available.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Calculate capacity
  const currentWeight = bookings.reduce((sum, b) => sum + (b.weight || 0), 0);
  const remainingWeight = vehicle.capacityWeight - currentWeight;
  const weightPercent = Math.min(Math.round((currentWeight / vehicle.capacityWeight) * 100), 100);
  const isTripActive = vehicle.transitStatus !== 'Idle';

  // Next expected stop details
  const expectedStop = route?.stopsDetails?.find((s, idx) => idx === route.currentStopIndex);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-xl font-black text-gray-900">Good morning, {user?.name || user?.username}</h1>
          <div className="flex items-center space-x-2 mt-1">
            <span className="text-[9px] font-black uppercase text-white bg-[#16a34a] px-2.5 py-0.5 rounded-full">
              ● ON DUTY
            </span>
            <span className="text-[10px] font-bold text-gray-450">
              Vehicle: {vehicle.vehicleId} • {vehicle.type}
            </span>
          </div>
        </div>
        <button 
          onClick={fetchTripData}
          className="w-9 h-9 rounded-xl bg-white border border-gray-100 hover:bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors cursor-pointer shadow-sm"
          title="Refresh Data"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Success/Error Alerts */}
      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-100 flex items-center space-x-3 text-[12px] font-bold">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="bg-green-50 text-green-700 p-4 rounded-xl border border-green-100 flex items-center space-x-3 text-[12px] font-bold">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-[#16a34a]" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Route Progress Stepper */}
        <div className="lg:col-span-2 space-y-6">
          {!isTripActive ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center space-y-4">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-400">
                <Truck className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto">
                <h3 className="text-base font-black text-gray-900">Trip is Ready to Depart</h3>
                <p className="text-[12px] text-gray-450 font-semibold mt-1 leading-relaxed">
                  You are registered on shipping lane <span className="text-gray-800 font-bold">{vehicle.routeLane}</span>. Start the trip to begin your transit route.
                </p>
              </div>
              <button
                onClick={handleStartTrip}
                disabled={submitting}
                className="px-6 py-2.5 rounded-xl bg-[#16a34a] text-white text-[12px] font-black hover:bg-[#15803d] transition-all flex items-center space-x-2 mx-auto cursor-pointer border-none shadow-md shadow-green-600/25"
              >
                <Play className="w-3.5 h-3.5 fill-white text-white" />
                <span>Start Multi-Stop Transit Trip</span>
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-gray-50 pb-4">
                <div>
                  <h3 className="text-[13px] font-black text-gray-900 uppercase tracking-wide">Transit Progress Tracker</h3>
                  <p className="text-[10px] text-gray-400 font-bold mt-0.5">Route Lane: {route?.routeName || route?.routeId}</p>
                </div>
                <span className="text-[9px] font-black uppercase text-[#16a34a] bg-green-50 px-2 py-0.5 border border-green-200 rounded-full">
                  Active Trip
                </span>
              </div>

              {/* Multi-Stop Timeline Stepper */}
              <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-gray-100">
                {route?.stopsDetails?.map((stop, index) => {
                  const isCompleted = stop.status === 'Completed';
                  const isExpected = index === route.currentStopIndex;

                  let badgeColor = 'bg-gray-200 text-gray-400';
                  let ringColor = 'ring-gray-100';
                  if (isCompleted) {
                    badgeColor = 'bg-[#16a34a] text-white';
                    ringColor = 'ring-green-100';
                  } else if (isExpected) {
                    badgeColor = 'bg-blue-600 text-white animate-pulse';
                    ringColor = 'ring-blue-100';
                  }

                  return (
                    <div key={stop.stopId} className="relative flex items-start justify-between">
                      <div className={`absolute left-[-21px] w-5 h-5 rounded-full ${badgeColor} flex items-center justify-center ring-4 ${ringColor} z-10 text-[9px] font-black`}>
                        {isCompleted ? '✓' : index + 1}
                      </div>

                      <div className="pl-4">
                        <div className="flex items-center space-x-2">
                          <p className={`text-[12px] font-black ${isCompleted ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                            {stop.locationName}
                          </p>
                          <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                            stop.stopType === 'ORIGIN' ? 'bg-indigo-50 text-indigo-700 border-indigo-150' : 
                            stop.stopType === 'FINAL_DESTINATION' ? 'bg-red-50 text-red-700 border-red-150' : 
                            'bg-gray-50 text-gray-500 border-gray-100'
                          }`}>
                            {stop.stopType.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400 font-semibold mt-0.5">
                          Status: {stop.status}
                          {isCompleted && stop.completedAt && ` • Arrived at ${new Date(stop.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                        </p>
                      </div>

                      <button
                        onClick={() => setShowQRModal(stop)}
                        className="no-underline flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-500 text-[10px] font-black transition-colors cursor-pointer"
                      >
                        <QrCode className="w-3 h-3" />
                        <span>View Stop QR</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Cargo Manifest */}
          {isTripActive && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center justify-between border-b border-gray-50 pb-4 mb-4">
                <div>
                  <h3 className="text-[13px] font-black text-gray-900 uppercase tracking-wide">Cargo Manifest Onboard</h3>
                  <p className="text-[10px] text-gray-450 font-bold mt-0.5">Currently loaded shipments inside the truck</p>
                </div>
                <div className="flex items-center space-x-1 text-[11px] font-black text-[#16a34a] bg-green-50 px-3 py-1 rounded-lg border border-green-200">
                  <Layers className="w-3.5 h-3.5" />
                  <span>{bookings.length} Shipments</span>
                </div>
              </div>

              {bookings.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[11px] font-semibold text-gray-750">
                    <thead>
                      <tr className="bg-gray-50 text-[9px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100">
                        <th className="px-4 py-2.5">Shipment ID</th>
                        <th className="px-4 py-2.5">Route</th>
                        <th className="px-4 py-2.5">Weight</th>
                        <th className="px-4 py-2.5">Volume</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {bookings.map((b) => (
                        <tr key={b._id} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3 font-mono font-bold text-[#16a34a] text-[10px]">{b.bookingId}</td>
                          <td className="px-4 py-3 text-gray-900 font-bold">
                            {b.fromStop} <span className="text-gray-400 font-medium">→</span> {b.toStop}
                          </td>
                          <td className="px-4 py-3 font-black text-gray-800">{b.weight} kg</td>
                          <td className="px-4 py-3 text-gray-500">{b.volume} m³</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="min-h-[100px] flex items-center justify-center border-2 border-dashed border-gray-150 rounded-2xl bg-gray-50/40 p-4 text-center">
                  <div className="text-gray-400 font-semibold text-[11px]">
                    <Info className="w-5 h-5 mx-auto mb-1 text-gray-300" />
                    <p>No cargo loaded. Complete stops to scan/execute scheduled shipments.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Verification Scanner & Capacity Gauges */}
        <div className="space-y-6">
          {isTripActive && expectedStop && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <div>
                <h3 className="text-[13px] font-black text-gray-900 uppercase tracking-wide">Stop Arrival & Gate-In</h3>
                <p className="text-[10px] text-gray-400 font-bold mt-0.5">Confirm truck arrival to execute cargo unloads & loads</p>
              </div>

              {/* Hub Gate Header */}
              <div className="relative h-28 bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl overflow-hidden flex flex-col items-center justify-center text-center p-4">
                <MapPin className="w-8 h-8 text-emerald-400 mb-1" />
                <span className="text-[12px] font-black text-white uppercase tracking-wider">
                  {expectedStop.locationName} Hub
                </span>
                <span className="text-[10px] font-bold text-slate-400 mt-0.5">
                  Stop #{expectedStop.sequenceNumber || expectedStop.sequence || 1} on Route
                </span>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start space-x-3 text-[11px] font-bold text-blue-800">
                <MapPin className="w-4 h-4 shrink-0 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-black text-blue-900">Expected Next Stop: {expectedStop.locationName}</p>
                  <p className="font-semibold text-[10px] text-blue-700 mt-0.5 leading-relaxed">
                    Confirm arrival to offload arriving packages and update remaining trailer capacity.
                  </p>
                </div>
              </div>

              {/* Arrival confirmation button */}
              <div className="space-y-3 pt-2 border-t border-gray-50">
                <button
                  onClick={() => handleVerifyQR(expectedStop.qrToken || expectedStop.secureToken, expectedStop.stopId)}
                  disabled={submitting}
                  className="w-full py-3 rounded-xl border border-transparent bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-colors cursor-pointer flex items-center justify-center space-x-2 shadow-sm shadow-emerald-600/20"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Confirm Truck Arrival at {expectedStop.locationName}</span>
                </button>
              </div>
            </div>
          )}

          {/* CAPACITY METRICS */}
          {isTripActive && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <div>
                <h3 className="text-[13px] font-black text-gray-900 uppercase tracking-wide">Available Cargo Space</h3>
                <p className="text-[10px] text-gray-400 font-bold mt-0.5">Live truck remaining capacity based on cargo weight</p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[11px] font-black">
                  <span className="text-gray-400">Weight Capacity</span>
                  <span className="text-gray-800">{currentWeight} / {vehicle.capacityWeight} kg</span>
                </div>
                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-350 ${
                      weightPercent > 85 ? 'bg-red-500' : weightPercent > 50 ? 'bg-amber-500' : 'bg-[#16a34a]'
                    }`}
                    style={{ width: `${weightPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 font-bold pt-1">
                  <span>Used: {weightPercent}%</span>
                  <span>Free: {remainingWeight} kg</span>
                </div>
              </div>
            </div>
          )}

          {/* DYNAMIC SPACE OPTIMIZATION RECOMMENDATIONS (READ ONLY) */}
          {isTripActive && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <div className="flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4 text-[#16a34a]" />
                <h3 className="text-[13px] font-black text-gray-900 uppercase tracking-wide">Optimized Consolidation Opportunities</h3>
              </div>
              <p className="text-[10px] text-gray-450 font-semibold leading-relaxed">
                Live recommendations compiled from remaining shipping stops. Acceptance must be approved by the Carrier.
              </p>

              <div className="space-y-3">
                {recommendations.length > 0 ? (
                  recommendations.map((rec) => (
                    <div key={rec._id} className="bg-green-50 border border-green-100 rounded-xl p-3.5 relative">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[8px] font-black text-[#16a34a] bg-white border border-green-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Match Found
                          </span>
                          <h4 className="text-[11px] font-black text-gray-900 mt-1.5">{rec.bookingId}</h4>
                          <p className="text-[10px] text-gray-500 mt-0.5 font-bold">
                            Lane Segment: {rec.fromStop} → {rec.toStop}
                          </p>
                        </div>
                        <span className="text-[11px] font-black text-[#16a34a]">{formatINR(rec.revenue)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-green-100/40 text-[9px] text-gray-400 font-bold">
                        <span>Weight: {rec.weight} kg</span>
                        <span className="text-right">Volume: {rec.volume} m³</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-center">
                    <p className="text-[10px] text-gray-400 font-bold">
                      No optimization matches fit the remaining route stops and capacity.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* QR Code Modal Lightbox */}
      {showQRModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-gray-150 max-w-sm w-full p-6 space-y-5 shadow-2xl relative">
            <div className="text-center">
              <span className="text-[9px] font-black text-[#16a34a] bg-green-50 px-2 py-0.5 rounded-full border border-green-200 uppercase tracking-widest">
                Stop QR Reference
              </span>
              <h3 className="text-lg font-black text-gray-900 mt-2">{showQRModal.locationName}</h3>
              <p className="text-[10px] font-semibold text-gray-400 mt-0.5">Stop Sequence #{showQRModal.sequenceNumber} • {showQRModal.stopType}</p>
            </div>

            <div className="w-48 h-48 bg-gray-50 border border-gray-100 rounded-2xl flex items-center justify-center mx-auto shadow-sm p-4">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${showQRModal.qrToken}`}
                alt={`QR code for stop ${showQRModal.locationName}`}
                className="w-full h-full object-contain"
              />
            </div>

            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block text-center">Stop Verification Token</span>
              <span className="block font-mono font-bold text-gray-800 text-[12px] text-center select-all mt-1">{showQRModal.qrToken}</span>
            </div>

            <button
              onClick={() => setShowQRModal(null)}
              className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-[12px] font-black transition-colors border-none cursor-pointer text-center block"
            >
              Close Stop Window
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverDashboard;
