import pytest
from app.models import DemandPredictionRequest, OccupancyPredictionRequest

def test_demand_prediction_model():
    req = DemandPredictionRequest(
        route="Chennai - Bengaluru",
        day_of_week=2,
        month=9,
        historical_avg=45.0
    )
    assert req.route == "Chennai - Bengaluru"
    assert req.day_of_week == 2
    assert req.month == 9
    assert req.historical_avg == 45.0

def test_occupancy_prediction_model():
    req = OccupancyPredictionRequest(
        vehicle_type="Container Truck",
        capacity_volume=100.0,
        assigned_volume=75.0,
        stops_count=4
    )
    assert req.vehicle_type == "Container Truck"
    assert req.capacity_volume == 100.0
    assert req.assigned_volume == 75.0
    assert req.stops_count == 4
