import { optimizeMultiTruckFleet } from '../optimizer/index.js';

const ROUTE_ABCD = { routeId: 'FLT-RTE-ABCD', stops: ['A', 'B', 'C', 'D'], distance: 480 };
const SMALL_TRUCK = { vehicleId: 'SMALL-TRK', capacityVolume: 30, capacityWeight: 5000, dimensions: { length: 4, width: 2.2, height: 2.2 } };
const MEDIUM_TRUCK = { vehicleId: 'MED-TRK', capacityVolume: 60, capacityWeight: 12000, dimensions: { length: 8, width: 2.4, height: 2.5 } };
const LARGE_TRUCK = { vehicleId: 'LARGE-TRK', capacityVolume: 100, capacityWeight: 20000, dimensions: { length: 13.6, width: 2.45, height: 3.0 } };

// ─── INV-B diagnostic ───────────────────────────────────────────────────────
const result = optimizeMultiTruckFleet({
  trucks: [SMALL_TRUCK, MEDIUM_TRUCK, LARGE_TRUCK],
  route: ROUTE_ABCD,
  shipments: [
    { shipmentId: 'INV-1', pickup: 'A', delivery: 'D', volume: 25, weight: 4000 },
    { shipmentId: 'INV-2', pickup: 'A', delivery: 'B', volume: 18, weight: 3000 },
    { shipmentId: 'INV-3', pickup: 'B', delivery: 'C', volume: 50, weight: 9000 },
    { shipmentId: 'INV-4', pickup: 'A', delivery: 'D', volume: 80, weight: 15000 },
    { shipmentId: 'INV-5', pickup: 'C', delivery: 'D', volume: 20, weight: 3000 }
  ]
});

console.log('Trucks activated:', result.trucksActivatedCount);
for (const p of result.truckPlans) {
  const ids = p.assignments.map(a => a.shipmentId);
  console.log(`Truck ${p.truck.vehicleId}: assignments=[${ids.join(',')}]`);
}
const allAssigned = result.truckPlans.flatMap(p => p.assignments.map(a => a.shipmentId));
console.log('All assigned (raw):', JSON.stringify(allAssigned));
const unique = new Set(allAssigned);
console.log('Unique count:', unique.size, '— allAssigned count:', allAssigned.length, '— DUPLICATE?', unique.size !== allAssigned.length);
console.log('Unassigned:', result.unassignedShipments.map(u => u.shipmentId + ': ' + u.reason?.slice(0, 60)));

// ─── T4 diagnostic ───────────────────────────────────────────────────────────
const ROUTE_AB = { routeId: 'FLT-RTE-AB', stops: ['A', 'B'], distance: 100 };
const t4 = optimizeMultiTruckFleet({
  trucks: [SMALL_TRUCK, MEDIUM_TRUCK, LARGE_TRUCK],
  route: ROUTE_AB,
  shipments: [
    { shipmentId: 'S-T4-A', pickup: 'A', delivery: 'B', volume: 25, weight: 4000 },
    { shipmentId: 'S-T4-B', pickup: 'A', delivery: 'B', volume: 55, weight: 10000 },
    { shipmentId: 'S-T4-C', pickup: 'A', delivery: 'B', volume: 80, weight: 15000 }
  ]
});
console.log('\nT4 trucks activated:', t4.trucksActivatedCount, 'isFullyAssigned:', t4.isFullyAssigned);
for (const p of t4.truckPlans) {
  console.log(`  Truck ${p.truck.vehicleId} (${p.truck.capacityVolume}m3): ${p.assignments.map(a => a.shipmentId + '(' + a.volume + 'm3)').join(', ')}`);
}
console.log('T4 unassigned:', t4.unassignedShipments.map(u => u.shipmentId));
