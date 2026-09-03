import React, { useState, useEffect } from 'react';
import {
  FileCheck, Search, ShieldCheck, MapPin, Truck, Box,
  AlertTriangle, CheckCircle2, ArrowRight, RefreshCw, Filter, Layers, Clock
} from 'lucide-react';
import axios from 'axios';

const ManagerAuditView = () => {
  const [activeTab, setActiveTab] = useState('TRACE'); // 'TRACE' | 'UNALLOCATED' | 'LEDGER'
  const [traceId, setTraceId] = useState('');
  const [traceEvents, setTraceEvents] = useState([]);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceError, setTraceError] = useState(null);

  const [unallocatedList, setUnallocatedList] = useState([]);
  const [unallocatedLoading, setUnallocatedLoading] = useState(false);

  const [ledgerEvents, setLedgerEvents] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [eventTypeFilter, setEventTypeFilter] = useState('ALL');

  // Fetch Lifecycle Trace for given ID
  const handleTraceLookup = async (e) => {
    if (e) e.preventDefault();
    if (!traceId) return;
    setTraceLoading(true);
    setTraceError(null);

    try {
      const token = localStorage.getItem('token');
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.get(`/api/audit/trace/${traceId.trim()}`, { headers: authHeader });

      if (res.data.events && res.data.events.length > 0) {
        setTraceEvents(res.data.events);
      } else {
        setTraceEvents([]);
      }
    } catch (err) {
      console.error('Trace error:', err);
      setTraceError('Failed to fetch lifecycle trace. Ensure the ID is correct and you have manager access.');
    } finally {
      setTraceLoading(false);
    }
  };

  // Fetch Unallocated Cargo Explanations
  const fetchUnallocated = async () => {
    setUnallocatedLoading(true);
    try {
      const token = localStorage.getItem('token');
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.get('/api/audit/unallocated', { headers: authHeader });

      if (res.data.unallocatedShipments && res.data.unallocatedShipments.length > 0) {
        setUnallocatedList(res.data.unallocatedShipments);
      } else {
        setUnallocatedList([]);
      }
    } catch (err) {
      console.error('Error fetching unallocated audit:', err);
    } finally {
      setUnallocatedLoading(false);
    }
  };

  // Fetch Global Event Ledger
  const fetchLedger = async () => {
    setLedgerLoading(true);
    try {
      const token = localStorage.getItem('token');
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.get('/api/audit/events', { headers: authHeader });
      setLedgerEvents(res.data.data?.events || []);
    } catch (err) {
      console.error('Error fetching ledger:', err);
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    handleTraceLookup();
    fetchUnallocated();
    fetchLedger();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <FileCheck className="w-6 h-6 text-emerald-600" />
          Operational Audit & Traceability System
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Append-only event ledger providing end-to-end lifecycle traceability and optimizer decision explanations.
        </p>
      </div>

      {/* Mode Tabs */}
      <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-2xl max-w-xl">
        <button
          onClick={() => setActiveTab('TRACE')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border-none cursor-pointer ${
            activeTab === 'TRACE' ? 'bg-white text-gray-900 shadow-sm' : 'bg-transparent text-gray-500'
          }`}
        >
          <Search className="w-3.5 h-3.5 text-emerald-600" />
          <span>"What happened to BKG-X?"</span>
        </button>

        <button
          onClick={() => setActiveTab('UNALLOCATED')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border-none cursor-pointer ${
            activeTab === 'UNALLOCATED' ? 'bg-white text-gray-900 shadow-sm' : 'bg-transparent text-gray-500'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          <span>"Why was cargo not allocated?"</span>
        </button>

        <button
          onClick={() => setActiveTab('LEDGER')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border-none cursor-pointer ${
            activeTab === 'LEDGER' ? 'bg-white text-gray-900 shadow-sm' : 'bg-transparent text-gray-500'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-blue-600" />
          <span>Global Audit Ledger</span>
        </button>
      </div>

      {/* ── TAB 1: SHIPMENT LIFECYCLE TRACE ("What happened to BKG-123?") ── */}
      {activeTab === 'TRACE' && (
        <div className="space-y-6">
          {/* Lookup Input Bar */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
            <form onSubmit={handleTraceLookup} className="flex items-center gap-3">
              <Search className="w-5 h-5 text-gray-400 shrink-0" />
              <input
                type="text"
                value={traceId}
                onChange={(e) => setTraceId(e.target.value)}
                placeholder="Enter Consignment or Booking Reference (e.g. BKG-001, SHP-77...)"
                required
                className="w-full text-xs font-semibold border-none outline-none text-gray-900 placeholder:text-gray-400"
              />
              <button
                type="submit"
                disabled={traceLoading}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm transition border-none cursor-pointer shrink-0"
              >
                {traceLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Inspect Lifecycle'}
              </button>
            </form>
          </div>

          {/* Error */}
          {traceError && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-sm font-semibold text-red-700">
              {traceError}
            </div>
          )}

          {/* Empty state */}
          {!traceError && !traceLoading && traceEvents.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-10 shadow-xs text-center">
              <FileCheck className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-bold text-gray-400">
                {traceId ? `No events found for "${traceId}"` : 'Enter a Booking or Shipment ID and click Inspect Lifecycle'}
              </p>
              <p className="text-xs text-gray-300 mt-1">Lifecycle events are recorded automatically as operations proceed.</p>
            </div>
          )}

          {/* Timeline Output */}
          {!traceError && traceEvents.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  Audited Consignment Ref
                </span>
                <span className="text-base font-black text-gray-900 font-mono">
                  {traceId}
                </span>
              </div>
              <span className="px-3 py-1 bg-emerald-50 text-emerald-800 rounded-full text-xs font-bold border border-emerald-200">
                {traceEvents.length} Recorded Lifecycle Events
              </span>
            </div>

            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-emerald-200">
              {traceEvents.map((ev, idx) => (
                <div key={ev.eventId || idx} className="relative group">
                  {/* Timeline Dot */}
                  <div className="absolute -left-[29px] top-1 w-4 h-4 rounded-full bg-emerald-600 ring-4 ring-emerald-100 shrink-0" />

                  <div className="bg-gray-50/80 hover:bg-gray-50 border border-gray-200/80 rounded-2xl p-4 transition-all space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-emerald-800">
                          {ev.eventType}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-gray-700 border border-gray-200">
                          Entity: {ev.entityType} ({ev.entityId})
                        </span>
                      </div>
                      <span className="text-[11px] text-gray-400 font-semibold">
                        {new Date(ev.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
                      <span>Actor: <strong className="text-gray-900">{ev.actor}</strong></span>
                      {ev.tripId && <span>Trip: <strong className="font-mono text-gray-900">{ev.tripId}</strong></span>}
                      <span>
                        State Shift: <span className="text-gray-500 font-medium">{ev.previousState || 'NONE'}</span> → <strong className="text-emerald-700">{ev.resultingState}</strong>
                      </span>
                    </div>

                    {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                      <div className="pt-2 border-t border-gray-200/60 text-[11px] text-gray-500 font-mono">
                        Metadata: {JSON.stringify(ev.metadata)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          )}
        </div>
      )}

      {/* ── TAB 2: UNALLOCATED CARGO EXPLANATIONS ──────────────────────── */}
      {activeTab === 'UNALLOCATED' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Optimizer Decision Explanations & Violated Constraints
            </h3>
            <span className="text-xs text-gray-500">{unallocatedList.length} unassigned cargo events</span>
          </div>

          <div className="space-y-3">
            {unallocatedList.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-10 shadow-xs text-center">
                <CheckCircle2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm font-bold text-gray-400">No unallocated cargo records found</p>
                <p className="text-xs text-gray-300 mt-1">All optimizer rejection reasons appear here when shipments cannot be accommodated.</p>
              </div>
            ) : (
              unallocatedList.map((u, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-amber-200 p-5 shadow-xs hover:border-amber-300 transition space-y-2"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-black text-gray-900">
                      {u.shipmentId}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                      Trip: {u.tripId || 'UNASSIGNED'}
                    </span>
                  </div>
                  <span className="text-[11px] text-gray-400">
                    {new Date(u.timestamp).toLocaleString()}
                  </span>
                </div>

                <p className="text-xs font-bold text-amber-900 bg-amber-50 p-2.5 rounded-xl border border-amber-100">
                  Explanation: {u.reason}
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[11px] font-semibold text-gray-500">Violated Invariants:</span>
                  {u.violatedConstraints.map((c, cIdx) => (
                    <span key={cIdx} className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-50 text-red-700 border border-red-200">
                      {c}
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 pt-1">
                  <span>Segment: <strong>{u.routeSegment || 'N/A'}</strong></span>
                  <span>Volume: <strong>{u.requestedVolume} m³</strong></span>
                  <span>Weight: <strong>{u.requestedWeight} kg</strong></span>
                </div>
              </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: GLOBAL AUDIT LEDGER ─────────────────────────────────── */}
      {activeTab === 'LEDGER' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              Complete Append-Only Operational Ledger
            </h3>
            <span className="text-xs text-gray-500">{ledgerEvents.length} events logged</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 font-bold uppercase tracking-wider">
                  <th className="pb-3 font-semibold">Event ID</th>
                  <th className="pb-3 font-semibold">Event Type</th>
                  <th className="pb-3 font-semibold">Entity</th>
                  <th className="pb-3 font-semibold">Trip</th>
                  <th className="pb-3 font-semibold">Actor</th>
                  <th className="pb-3 font-semibold">State Transition</th>
                  <th className="pb-3 font-semibold">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ledgerEvents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-gray-400 font-semibold">
                      No audit events recorded yet. Events are logged automatically as operations are performed.
                    </td>
                  </tr>
                ) : (
                  ledgerEvents.map((ev) => (
                    <tr key={ev.eventId || ev._id} className="hover:bg-gray-50/70 transition">
                      <td className="py-3 font-mono font-bold text-gray-900">{ev.eventId}</td>
                      <td className="py-3 font-mono font-bold text-emerald-800">{ev.eventType}</td>
                      <td className="py-3 text-gray-700">{ev.entityType} ({ev.entityId})</td>
                      <td className="py-3 font-mono text-gray-600">{ev.tripId || '—'}</td>
                      <td className="py-3 text-gray-800 font-semibold">{ev.actor}</td>
                      <td className="py-3 text-gray-600">{ev.previousState || 'NONE'} → <strong>{ev.resultingState}</strong></td>
                      <td className="py-3 text-gray-400">{new Date(ev.timestamp).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerAuditView;
