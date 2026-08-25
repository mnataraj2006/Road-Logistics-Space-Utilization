from pydantic import BaseModel
from typing import List, Dict

# Demand Forecasting Requests & Responses
class DemandForecastRequest(BaseModel):
    route_id: str
    days_ahead: int = 7

class DailyForecast(BaseModel):
    date: str
    predicted_bookings_count: int

class DemandForecastResponse(BaseModel):
    route_id: str
    forecast: List[DailyForecast]

# Occupancy Prediction Requests & Responses
class OccupancyPredictionRequest(BaseModel):
    vehicle_id: str
    route_id: str
    date: str  # Format: YYYY-MM-DD
    current_volume: float  # Current booked volume in m³
    current_weight: float  # Current booked weight in kg

class OccupancyPredictionResponse(BaseModel):
    vehicle_id: str
    predicted_utilization_percent: float
    is_underutilized: bool
    confidence: float
    recommendation: str

# Delay Prediction Requests & Responses
class DelayPredictionRequest(BaseModel):
    vehicle_id: str
    route_id: str
    date: str  # Format: YYYY-MM-DD

class DelayPredictionResponse(BaseModel):
    vehicle_id: str
    route_id: str
    predicted_delay_hours: float
    confidence: float
    status: str

# Price Prediction Requests & Responses
class PricePredictionRequest(BaseModel):
    route_id: str
    volume: float
    weight: float
    date: str  # Format: YYYY-MM-DD

class PricePredictionResponse(BaseModel):
    route_id: str
    suggested_price: float
    confidence: float
    recommendation: str

# Model Retraining Responses
class RetrainResponse(BaseModel):
    status: str
    message: str
    metrics: Dict[str, float]

# Consolidation Optimization Schemas
class ShipmentItem(BaseModel):
    bookingId: str
    volume: float
    weight: float
    routeId: str
    fromStop: str = ""
    toStop: str = ""

class VehicleItem(BaseModel):
    vehicleId: str
    capacityVolume: float
    capacityWeight: float
    type: str = "Heavy Truck"
    routeStops: List[str] = []

class OptimizationRequest(BaseModel):
    shipments: List[ShipmentItem]
    vehicles: List[VehicleItem]


