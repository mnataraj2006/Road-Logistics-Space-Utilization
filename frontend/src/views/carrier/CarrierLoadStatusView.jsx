import React from 'react';
import { Layers, Truck, Box } from 'lucide-react';
import OperationalLoadVisualizer from '../../components/optimizer/OperationalLoadVisualizer';

const CarrierLoadStatusView = () => {
  const sampleLoad = [
    { shipmentId: 'BKG-001', pickup: 'Chennai', delivery: 'Coimbatore', volume: 25, weight: 4800, position: { x: 0, y: 0, z: 0 }, dimensions: { dx: 3.2, dy: 1.2, dz: 1.5 } },
    { shipmentId: 'BKG-004', pickup: 'Chennai', delivery: 'Madurai', volume: 35, weight: 7200, position: { x: 4.0, y: 0, z: 0 }, dimensions: { dx: 4.5, dy: 1.5, dz: 1.5 } },
    { shipmentId: 'BKG-009', pickup: 'Salem', delivery: 'Madurai', volume: 18, weight: 3500, position: { x: 9.0, y: 0, z: 0 }, dimensions: { dx: 2.8, dy: 1.2, dz: 1.2 } }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <Layers className="w-6 h-6 text-emerald-600" />
          Carrier Trailer Cargo Placement & Weight Distribution
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Operational schematic of cargo loaded in trailer with stop-by-stop accessibility.
        </p>
      </div>

      <OperationalLoadVisualizer
        tripId="TRIP-CH-MAD-01"
        vehicleId="TRK-FASTLANE-08"
        truckSpecs={{
          capacityVolume: 100,
          capacityWeight: 20000,
          dimensions: { length: 13.6, width: 2.45, height: 3.0 }
        }}
        route={{
          routeId: 'RTE-TN-CORRIDOR',
          stops: ['Chennai', 'Salem', 'Coimbatore', 'Madurai']
        }}
        currentStopIndex={1}
        assignments={sampleLoad}
      />
    </div>
  );
};

export default CarrierLoadStatusView;
