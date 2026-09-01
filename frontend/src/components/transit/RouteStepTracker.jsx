import React from 'react';
import { MapPin, CheckCircle2, Clock, AlertCircle, ArrowRight, ShieldCheck, QrCode } from 'lucide-react';

/**
 * Visual multi-stop route pipeline showing progress from origin to final destination.
 *
 * @param {Object} props
 * @param {Array} props.stops - Ordered list of stop names or stop details objects
 * @param {number} props.currentStopIndex - Index of the current active stop
 * @param {string} props.tripStatus - Overall trip status (e.g. 'IN_TRANSIT', 'AT_STOP', 'COMPLETED')
 * @param {Function} [props.onVerifyStop] - Callback when user clicks to verify stop
 */
const RouteStepTracker = ({
  stops = [],
  currentStopIndex = 0,
  tripStatus = 'PLANNED',
  onVerifyStop
}) => {
  const getStopName = (s) => (typeof s === 'string' ? s : s.locationName || s.name || 'Stop');
  const getStopStatus = (s, idx) => {
    if (typeof s === 'object' && s.status) return s.status;
    if (idx < currentStopIndex) return 'Completed';
    if (idx === currentStopIndex) {
      return tripStatus === 'AT_STOP' || tripStatus === 'OPERATIONS_IN_PROGRESS' ? 'At Stop' : 'In Transit';
    }
    return 'Upcoming';
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-emerald-600" />
          Multi-Stop Route Pipeline
        </h4>
        <span className="text-xs font-bold text-gray-700">
          Stop {Math.min(stops.length, currentStopIndex + 1)} of {stops.length}
        </span>
      </div>

      <div className="relative flex items-center justify-between gap-2 overflow-x-auto py-3">
        {stops.map((stop, idx) => {
          const stopName = getStopName(stop);
          const status = getStopStatus(stop, idx);
          const isCompleted = idx < currentStopIndex || status === 'Completed' || tripStatus === 'COMPLETED';
          const isCurrent = idx === currentStopIndex && tripStatus !== 'COMPLETED';
          const isUpcoming = idx > currentStopIndex && tripStatus !== 'COMPLETED';

          return (
            <React.Fragment key={`stop-node-${idx}`}>
              {/* Connector line between stops */}
              {idx > 0 && (
                <div
                  className={`flex-1 h-1 min-w-[28px] rounded transition-colors ${
                    isCompleted ? 'bg-emerald-500' : isCurrent ? 'bg-amber-400' : 'bg-gray-200'
                  }`}
                />
              )}

              {/* Stop Node */}
              <div className="flex flex-col items-center text-center shrink-0 min-w-[70px] group">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs transition-all shadow-sm ${
                    isCompleted
                      ? 'bg-emerald-500 text-white shadow-emerald-500/20'
                      : isCurrent
                      ? 'bg-amber-500 text-white ring-4 ring-amber-100 animate-pulse shadow-amber-500/30'
                      : 'bg-gray-100 text-gray-400 border border-gray-200'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : isCurrent ? (
                    <MapPin className="w-4 h-4" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>

                <span className="text-xs font-bold text-gray-900 mt-2 truncate max-w-[90px]">
                  {stopName}
                </span>

                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5 uppercase tracking-wide ${
                    isCompleted
                      ? 'text-emerald-700 bg-emerald-50'
                      : isCurrent
                      ? 'text-amber-800 bg-amber-50'
                      : 'text-gray-400 bg-gray-50'
                  }`}
                >
                  {isCompleted ? 'Completed' : isCurrent ? 'Active Stop' : 'Upcoming'}
                </span>

                {isCurrent && onVerifyStop && (
                  <button
                    onClick={() => onVerifyStop(stop, idx)}
                    className="mt-2 inline-flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold shadow transition cursor-pointer border-none"
                  >
                    <QrCode className="w-3 h-3" />
                    Verify
                  </button>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default RouteStepTracker;
