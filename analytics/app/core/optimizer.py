from typing import List, Dict, Any

def optimize_load_consolidation(shipments: List[Dict[str, Any]], vehicles: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Consolidates pending/unassigned shipments into vehicles using a Multi-Dimensional First-Fit Decreasing 
    bin packing heuristic, respecting both volume (m³) and weight (kg) capacity constraints across multi-stop legs.
    """
    # Sort shipments by volume descending (primary) and weight descending (secondary)
    sorted_shipments = sorted(
        shipments, 
        key=lambda s: (s.get("volume", 0), s.get("weight", 0)), 
        reverse=True
    )
    
    # Initialize vehicle bin states
    vehicle_bins = []
    for v in vehicles:
        stops = v.get("routeStops", [])
        # If stops are empty or single, default to dummy route
        if not stops or len(stops) <= 1:
            stops = ["Origin", "Destination"]
            
        legs = []
        for i in range(len(stops) - 1):
            legs.append({
                "fromStop": stops[i],
                "toStop": stops[i+1],
                "capacityVolume": float(v["capacityVolume"]),
                "capacityWeight": float(v["capacityWeight"]),
                "remainingVolume": float(v["capacityVolume"]),
                "remainingWeight": float(v["capacityWeight"]),
                "volumeUtilizationPercent": 0.0,
                "weightUtilizationPercent": 0.0
            })
            
        vehicle_bins.append({
            "vehicleId": v["vehicleId"],
            "type": v.get("type", "Heavy Truck"),
            "capacityVolume": float(v["capacityVolume"]),
            "capacityWeight": float(v["capacityWeight"]),
            "routeStops": stops,
            "legs": legs,
            "assignedShipments": [],
        })
        
    unassigned_shipments = []
    
    # Process each shipment
    for shipment in sorted_shipments:
        shipment_vol = float(shipment.get("volume", 0))
        shipment_wt = float(shipment.get("weight", 0))
        from_s = shipment.get("fromStop") or ""
        to_s = shipment.get("toStop") or ""
        
        assigned = False
        
        # Try to pack in the first vehicle that fits
        for bin_state in vehicle_bins:
            stops = bin_state["routeStops"]
            stop_idx = {stop: idx for idx, stop in enumerate(stops)}
            
            # Resolve pickup/delivery index
            p_idx = stop_idx.get(from_s)
            d_idx = stop_idx.get(to_s)
            
            # If not specified or not found in truck's stops, try to fit at ends if dummy, otherwise fail
            if p_idx is None or d_idx is None:
                if len(stops) == 2 and stops == ["Origin", "Destination"]:
                    p_idx = 0
                    d_idx = 1
                else:
                    continue  # Shipment stops not served by this vehicle's route
                    
            if p_idx >= d_idx:
                continue  # Invalid direction for this route
                
            # Check capacity on ALL occupied legs
            legs_to_check = range(p_idx, d_idx)
            fits = True
            for leg_idx in legs_to_check:
                leg = bin_state["legs"][leg_idx]
                if leg["remainingVolume"] < shipment_vol or leg["remainingWeight"] < shipment_wt:
                    fits = False
                    break
                    
            if fits:
                # Deduct capacity from occupied legs
                for leg_idx in legs_to_check:
                    bin_state["legs"][leg_idx]["remainingVolume"] -= shipment_vol
                    bin_state["legs"][leg_idx]["remainingWeight"] -= shipment_wt
                    
                bin_state["assignedShipments"].append(shipment)
                assigned = True
                break
                
        if not assigned:
            unassigned_shipments.append(shipment)
            
    # Compile results
    active_bins = []
    trucks_used = 0
    total_vol_capacity = 0.0
    total_wt_capacity = 0.0
    total_vol_used = 0.0
    total_wt_used = 0.0
    
    for bin_state in vehicle_bins:
        num_shipments = len(bin_state["assignedShipments"])
        
        if num_shipments > 0:
            trucks_used += 1
            total_vol_capacity += bin_state["capacityVolume"]
            total_wt_capacity += bin_state["capacityWeight"]
            
            # Calculate leg-by-leg utilization
            peak_vol_util = 0.0
            peak_wt_util = 0.0
            sum_vol_util = 0.0
            sum_wt_util = 0.0
            
            for leg in bin_state["legs"]:
                vol_used = leg["capacityVolume"] - leg["remainingVolume"]
                wt_used = leg["capacityWeight"] - leg["remainingWeight"]
                
                vol_util = round((vol_used / leg["capacityVolume"]) * 100, 1) if leg["capacityVolume"] > 0 else 0.0
                wt_util = round((wt_used / leg["capacityWeight"]) * 100, 1) if leg["capacityWeight"] > 0 else 0.0
                
                leg["remainingVolume"] = round(leg["remainingVolume"], 1)
                leg["remainingWeight"] = round(leg["remainingWeight"], 1)
                leg["volumeUtilizationPercent"] = vol_util
                leg["weightUtilizationPercent"] = wt_util
                
                peak_vol_util = max(peak_vol_util, vol_util)
                peak_wt_util = max(peak_wt_util, wt_util)
                sum_vol_util += vol_util
                sum_wt_util += wt_util
                
            avg_vol_util = round(sum_vol_util / len(bin_state["legs"]), 1)
            avg_wt_util = round(sum_wt_util / len(bin_state["legs"]), 1)
            
            # Aggregate total volume used as the max volume occupied in any single segment of the truck
            total_vol_used += max(0.0, bin_state["capacityVolume"] - min(leg["remainingVolume"] for leg in bin_state["legs"]))
            total_wt_used += max(0.0, bin_state["capacityWeight"] - min(leg["remainingWeight"] for leg in bin_state["legs"]))
            
            # Sort assigned shipments by destination stop index descending (LIFO loading order)
            stops_order = {stop: idx for idx, stop in enumerate(bin_state["routeStops"])}
            sorted_assigned = sorted(
                bin_state["assignedShipments"],
                key=lambda s: stops_order.get(s.get("toStop", ""), 999),
                reverse=True
            )
            
            active_bins.append({
                "vehicleId": bin_state["vehicleId"],
                "type": bin_state["type"],
                "capacityVolume": bin_state["capacityVolume"],
                "capacityWeight": bin_state["capacityWeight"],
                "routeStops": bin_state["routeStops"],
                "legs": bin_state["legs"],
                "volumeUtilizationPercent": avg_vol_util,
                "weightUtilizationPercent": avg_wt_util,
                "peakVolumeUtilizationPercent": peak_vol_util,
                "peakWeightUtilizationPercent": peak_wt_util,
                "shipments": sorted_assigned
            })
            
    avg_volume_utilization = round((total_vol_used / total_vol_capacity) * 100, 1) if total_vol_capacity > 0 else 0.0
    avg_weight_utilization = round((total_wt_used / total_wt_capacity) * 100, 1) if total_wt_capacity > 0 else 0.0
    
    # Calculate consolidation metrics
    trucks_saved = max(0, len(shipments) - trucks_used)
    
    return {
        "consolidations": active_bins,
        "unassignedShipments": unassigned_shipments,
        "metrics": {
            "totalShipments": len(shipments),
            "trucksUsed": trucks_used,
            "trucksSaved": trucks_saved,
            "avgVolumeUtilization": avg_volume_utilization,
            "avgWeightUtilization": avg_weight_utilization
        }
    }
