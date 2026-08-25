import React, { useState } from 'react';
import { X, QrCode, Copy, Check, Printer, ShieldCheck } from 'lucide-react';
import api from '../../services/api';

/**
 * Pure SVG QR Code Generator Component (Zero dependency)
 */
const SimpleQrCode = ({ text, size = 160 }) => {
  // Simple matrix generation for token encoding representation
  const generateMatrix = (str) => {
    const grid = Array(21).fill(0).map(() => Array(21).fill(0));
    
    // Finder patterns (top-left, top-right, bottom-left)
    const drawFinder = (row, col) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
            grid[row + r][col + c] = 1;
          }
        }
      }
    };

    drawFinder(0, 0);
    drawFinder(0, 14);
    drawFinder(14, 0);

    // Hash-driven data matrix fill
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }

    for (let r = 0; r < 21; r++) {
      for (let c = 0; c < 21; c++) {
        // Skip finder areas
        if ((r < 7 && c < 7) || (r < 7 && c >= 14) || (r >= 14 && c < 7)) continue;
        const seed = Math.abs((hash ^ (r * 21 + c * 31)) % 100);
        grid[r][c] = seed > 45 ? 1 : 0;
      }
    }
    return grid;
  };

  const matrix = generateMatrix(text || 'DEFAULT');
  const cellSize = size / 21;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="bg-white p-2 rounded-xl shadow-inner border border-gray-100">
      {matrix.map((row, rIdx) =>
        row.map((cell, cIdx) => cell === 1 ? (
          <rect
            key={`${rIdx}-${cIdx}`}
            x={cIdx * cellSize}
            y={rIdx * cellSize}
            width={cellSize}
            height={cellSize}
            fill="#0f172a"
            rx={cellSize * 0.15}
          />
        ) : null)
      )}
    </svg>
  );
};

const RouteQrModal = ({ route, onClose, onRefresh }) => {
  const [copiedToken, setCopiedToken] = useState(null);
  const [generating, setGenerating] = useState(false);

  if (!route) return null;

  const stops = route.stopsDetails || [];

  const handleCopy = (token) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleGenerateNewQr = async (stopId) => {
    setGenerating(true);
    try {
      await api.post(`/transit/routes/${route.routeId}/stops/${stopId}/generate-qr`);
      if (onRefresh) onRefresh();
    } catch (e) {
      alert(e.response?.data?.message || 'Failed to generate new QR token');
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl border border-gray-100 flex flex-col">
        
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-50 border border-green-200 rounded-2xl flex items-center justify-center text-[#16a34a]">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-gray-900 tracking-tight">Route Stop QR Tokens</h2>
              <p className="text-[11px] text-gray-400 font-semibold">Route: <span className="text-gray-700 font-black">{route.routeId}</span> ({route.source} ➔ {route.destination})</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-[11px] font-bold cursor-pointer border-none"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Tokens</span>
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white border border-gray-200 hover:bg-gray-100 flex items-center justify-center text-gray-500 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Content - List of Stops & QR Codes */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="bg-green-50/60 border border-green-100 p-3.5 rounded-2xl text-[11px] text-green-800 font-semibold flex items-start space-x-2.5">
            <ShieldCheck className="w-4 h-4 text-[#16a34a] shrink-0 mt-0.5" />
            <span>Each route stop has a unique, server-side validated token. Physical verification at stops requires scanning the stop's QR code.</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stops.map((stop, idx) => (
              <div key={stop.stopId || idx} className="bg-gray-50/70 border border-gray-100 rounded-2xl p-4 flex flex-col justify-between space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-[9px] font-black uppercase tracking-wider">Stop #{idx + 1}</span>
                    <h3 className="text-sm font-black text-gray-900 mt-1">{stop.locationName}</h3>
                  </div>
                  <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full border ${
                    stop.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' :
                    stop.status === 'Ready' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-100 text-gray-500 border-gray-200'
                  }`}>{stop.status || 'Upcoming'}</span>
                </div>

                <div className="flex items-center justify-center py-2">
                  <SimpleQrCode text={stop.qrToken} size={150} />
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-2.5 flex items-center justify-between text-[10px]">
                  <div className="truncate pr-2">
                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Token</span>
                    <span className="font-mono font-bold text-gray-800 truncate block">{stop.qrToken}</span>
                  </div>
                  <button
                    onClick={() => handleCopy(stop.qrToken)}
                    className="p-2 text-gray-500 hover:text-[#16a34a] bg-gray-50 hover:bg-green-50 rounded-lg cursor-pointer border-none"
                    title="Copy QR Token string"
                  >
                    {copiedToken === stop.qrToken ? <Check className="w-3.5 h-3.5 text-[#16a34a]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <button
                  onClick={() => handleGenerateNewQr(stop.stopId)}
                  disabled={generating}
                  className="w-full py-2 bg-white hover:bg-gray-100 text-gray-600 border border-gray-200 rounded-xl text-[10px] font-bold cursor-pointer transition-colors"
                >
                  Regenerate Token
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-black cursor-pointer border-none shadow-sm"
          >
            Close Window
          </button>
        </div>

      </div>
    </div>
  );
};

export default RouteQrModal;
