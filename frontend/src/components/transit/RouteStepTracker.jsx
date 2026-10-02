import React from 'react';
import { MapPin, CheckCircle2, QrCode } from 'lucide-react';

/**
 * Multi-stop route pipeline showing authoritative progress from origin to final destination.
 * Uses TripStop verificationStatus when available.
 */
const RouteStepTracker = ({
  stops = [],
  stopsList = [],
  currentStopIndex = 0,
  tripStatus = 'PLANNED',
  onVerifyStop
}) => {
  const getStopName = (s) => (typeof s === 'string' ? s : s.locationName || s.location || s.name || 'Stop');

  // Compute next pending index within `stops` (first stop that is not COMPLETED)
  let nextPendingIndex = -1;
  if (tripStatus === 'COMPLETED') {
    nextPendingIndex = -1;
  } else {
    nextPendingIndex = stops.findIndex((stop, idx) => {
      if (idx === 0) return false; // Origin is departed once in transit
      const stopName = getStopName(stop);
      const matched = stopsList?.find(
        (s) =>
          getStopName(s).toLowerCase().trim() === stopName.toLowerCase().trim() ||
          s.sequence === idx + 1 ||
          s.sequenceNumber === idx + 1
      );
      return !matched || matched.verificationStatus !== 'COMPLETED';
    });

    if (nextPendingIndex === -1 && tripStatus !== 'COMPLETED') {
      nextPendingIndex = Math.min(stops.length - 1, (currentStopIndex || 0) + 1);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-emerald-600" />
          Multi-Stop Route Pipeline
        </h4>
        <span className="text-xs font-bold text-gray-700">
          Stop {Math.min(stops.length, nextPendingIndex >= 0 ? nextPendingIndex + 1 : currentStopIndex + 1)} of {stops.length}
        </span>
      </div>

      <div className="relative flex items-center justify-between gap-2 overflow-x-auto py-3">
        {stops.map((stop, idx) => {
          const stopName = getStopName(stop);
          // Look up stopObj by matching name or sequence instead of naive array index
          const stopObj =
            stopsList?.find(
              (s) =>
                getStopName(s).toLowerCase().trim() === stopName.toLowerCase().trim() ||
                s.sequence === idx + 1 ||
                s.sequenceNumber === idx + 1
            ) || (typeof stop === 'object' ? stop : null);

          // Authoritative completion status
          const isCompleted =
            tripStatus === 'COMPLETED' ||
            stopObj?.verificationStatus === 'COMPLETED' ||
            (nextPendingIndex > 0 ? idx < nextPendingIndex : idx === 0 && ['DISPATCHED', 'IN_TRANSIT', 'AT_STOP'].includes(tripStatus));

          const isNextActive =
            !isCompleted &&
            tripStatus !== 'COMPLETED' &&
            idx === nextPendingIndex;

          const isUpcoming = !isCompleted && !isNextActive;

          return (
            <React.Fragment key={`stop-node-${idx}`}>
              {/* Connector line between stops */}
              {idx > 0 && (
                <div
                  className={`flex-1 h-1 min-w-[28px] rounded transition-colors ${
                    isCompleted ? 'bg-emerald-500' : isNextActive ? 'bg-amber-400' : 'bg-gray-200'
                  }`}
                />
              )}

              {/* Stop Node */}
              <div className="flex flex-col items-center text-center shrink-0 min-w-[75px] group">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs transition-all shadow-sm ${
                    isCompleted
                      ? 'bg-emerald-500 text-white shadow-emerald-500/20'
                      : isNextActive
                      ? 'bg-amber-500 text-white ring-4 ring-amber-100 animate-pulse shadow-amber-500/30'
                      : 'bg-gray-100 text-gray-400 border border-gray-200'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : isNextActive ? (
                    <MapPin className="w-4 h-4" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>

                <span className="text-xs font-bold text-gray-900 mt-2 truncate max-w-[95px]">
                  {stopName}
                </span>

                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5 uppercase tracking-wide ${
                    isCompleted
                      ? 'text-emerald-700 bg-emerald-50'
                      : isNextActive
                      ? 'text-amber-800 bg-amber-50'
                      : 'text-gray-400 bg-gray-50'
                  }`}
                >
                  {isCompleted ? 'Completed' : isNextActive ? 'Next Stop' : 'Upcoming'}
                </span>

                {isNextActive && onVerifyStop && ['DISPATCHED', 'IN_TRANSIT', 'AT_STOP'].includes(tripStatus) && (
                  <button
                    onClick={() => onVerifyStop(stopObj || stop, idx)}
                    className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[10px] font-black shadow-sm transition cursor-pointer border-none"
                    title={`Verify Arrival at ${stopName}`}
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
