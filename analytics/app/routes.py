import os
import datetime
import pandas as pd
import numpy as np
import joblib
from fastapi import APIRouter, HTTPException
from pymongo import MongoClient
from app.core.config import settings
from app.models import (
    DemandForecastRequest, DemandForecastResponse, DailyForecast,
    OccupancyPredictionRequest, OccupancyPredictionResponse,
    DelayPredictionRequest, DelayPredictionResponse,
    PricePredictionRequest, PricePredictionResponse,
    RetrainResponse, OptimizationRequest
)
from ml.training.train import run_training
from app.core.optimizer import optimize_load_consolidation

router = APIRouter()

# Global model pointers
_demand_model = None
_occupancy_model = None
_delay_model = None
_price_model = None

def load_models():
    global _demand_model, _occupancy_model, _delay_model, _price_model
    demand_path = os.path.join(settings.MODEL_DIR, "demand_forecast_model.joblib")
    occupancy_path = os.path.join(settings.MODEL_DIR, "occupancy_prediction_model.joblib")
    delay_path = os.path.join(settings.MODEL_DIR, "delay_prediction_model.joblib")
    price_path = os.path.join(settings.MODEL_DIR, "price_prediction_model.joblib")
    
    if os.path.exists(demand_path):
        try:
            _demand_model = joblib.load(demand_path)
            print("Loaded Statsmodels demand forecasting dictionary.")
        except Exception as e:
            print(f"Error loading demand model: {e}")
            
    if os.path.exists(occupancy_path):
        try:
            _occupancy_model = joblib.load(occupancy_path)
            print("Loaded occupancy prediction model.")
        except Exception as e:
            print(f"Error loading occupancy model: {e}")

    if os.path.exists(delay_path):
        try:
            _delay_model = joblib.load(delay_path)
            print("Loaded delay prediction model.")
        except Exception as e:
            print(f"Error loading delay model: {e}")

    if os.path.exists(price_path):
        try:
            _price_model = joblib.load(price_path)
            print("Loaded price prediction model.")
        except Exception as e:
            print(f"Error loading price model: {e}")

# Initial load attempt
load_models()

@router.post("/predict/demand", response_model=DemandForecastResponse)
async def predict_demand(req: DemandForecastRequest):
    global _demand_model
    
    if _demand_model is None:
        load_models()
        
    route_id = req.route_id
    days_ahead = req.days_ahead
    
    today = datetime.date.today()
    dates = [today + datetime.timedelta(days=i) for i in range(1, days_ahead + 1)]
    
    forecasts = []
    
    # Check if we have a statsmodels model trained for this route
    if _demand_model is not None and isinstance(_demand_model, dict) and route_id in _demand_model:
        try:
            fitted_model = _demand_model[route_id]
            # Forecast using Statsmodels ExponentialSmoothing forecast
            predictions = fitted_model.forecast(days_ahead)
            
            for d, pred in zip(dates, predictions):
                pred_val = max(int(round(pred)), 0)
                forecasts.append(DailyForecast(date=d.strftime("%Y-%m-%d"), predicted_bookings_count=pred_val))
        except Exception as e:
            print(f"Statsmodels prediction error for route {route_id}: {e}")
            for d in dates:
                forecasts.append(DailyForecast(date=d.strftime("%Y-%m-%d"), predicted_bookings_count=4))
    else:
        # Fallback baseline forecasting rules
        print("Statsmodels route forecast not found, using baseline fallback.")
        for d in dates:
            base = 6 if route_id == 'RTE-001' else 4
            if d.weekday() in [5, 6]:
                base = int(base * 0.45)
            forecasts.append(DailyForecast(date=d.strftime("%Y-%m-%d"), predicted_bookings_count=base))
            
    return DemandForecastResponse(route_id=route_id, forecast=forecasts)

@router.post("/predict/occupancy", response_model=OccupancyPredictionResponse)
async def predict_occupancy(req: OccupancyPredictionRequest):
    global _occupancy_model
    
    if _occupancy_model is None:
        load_models()
        
    vehicle_id = req.vehicle_id
    route_id = req.route_id
    date_str = req.date
    current_vol = req.current_volume
    current_wt = req.current_weight
    
    try:
        dt = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")
        
    day_of_week = dt.weekday()
    month = dt.month
    is_weekend = 1 if day_of_week in [5, 6] else 0
    
    # Fetch details from MongoDB
    client = MongoClient(settings.MONGO_URI)
    db = client.get_default_database()
    
    vehicle = db.vehicles.find_one({"vehicleId": vehicle_id})
    route = db.routes.find_one({"routeId": route_id})
    client.close()
    
    if not vehicle:
        raise HTTPException(status_code=404, detail=f"Vehicle '{vehicle_id}' not found in database")
    if not route:
        raise HTTPException(status_code=404, detail=f"Route '{route_id}' not found in database")
        
    capacity_vol = vehicle["capacityVolume"]
    capacity_wt = vehicle["capacityWeight"]
    v_type = vehicle["type"]
    distance = route["distance"]
    base_rate = route["baseRate"]
    
    predicted_utilization = 0.0
    confidence = 0.88
    
    if _occupancy_model is not None:
        try:
            df_features = pd.DataFrame([{
                'vehicleId': vehicle_id,
                'routeId': route_id,
                'type': v_type,
                'capacityVolume': capacity_vol,
                'capacityWeight': capacity_wt,
                'distance': distance,
                'baseRate': base_rate,
                'day_of_week': day_of_week,
                'month': month,
                'is_weekend': is_weekend
            }])
            
            pred_pct = _occupancy_model.predict(df_features)[0]
            predicted_utilization = float(round(pred_pct, 1))
            
            current_utilization = (current_vol / capacity_vol) * 100
            predicted_utilization = max(predicted_utilization, current_utilization)
            predicted_utilization = min(predicted_utilization, 100.0)
        except Exception as e:
            print(f"Occupancy prediction error: {e}")
            predicted_utilization = (current_vol / capacity_vol) * 100
    else:
        base_rate_load = 75.0
        if v_type == 'Light Van':
            base_rate_load = 85.0
        elif v_type == 'Heavy Truck':
            base_rate_load = 68.0
            
        if is_weekend:
            base_rate_load *= 0.65
            
        predicted_utilization = float(round(base_rate_load, 1))
        current_utilization = (current_vol / capacity_vol) * 100
        predicted_utilization = max(predicted_utilization, current_utilization)
        predicted_utilization = min(predicted_utilization, 100.0)
        confidence = 0.65

    is_under = predicted_utilization < 75.0
    if is_under:
        free_space = round(capacity_vol * (1 - predicted_utilization / 100), 1)
        recommendation = f"Predicting underutilization. Truck will have ~{free_space} m³ empty space. Action: Apply 15% discount for local SMB listings on this route to attract consolidated freight."
    else:
        recommendation = "Truck occupancy is optimal. Maintain current booking rates."

    return OccupancyPredictionResponse(
        vehicle_id=vehicle_id,
        predicted_utilization_percent=predicted_utilization,
        is_underutilized=is_under,
        confidence=confidence,
        recommendation=recommendation
    )

@router.post("/predict/delay", response_model=DelayPredictionResponse)
async def predict_delay(req: DelayPredictionRequest):
    global _delay_model
    
    if _delay_model is None:
        load_models()
        
    vehicle_id = req.vehicle_id
    route_id = req.route_id
    date_str = req.date
    
    try:
        dt = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")
        
    day_of_week = dt.weekday()
    month = dt.month
    
    client = MongoClient(settings.MONGO_URI)
    db = client.get_default_database()
    vehicle = db.vehicles.find_one({"vehicleId": vehicle_id})
    route = db.routes.find_one({"routeId": route_id})
    client.close()
    
    if not vehicle or not route:
        raise HTTPException(status_code=404, detail="Vehicle or Route not found in database")
        
    distance = route["distance"]
    v_type = vehicle["type"]
    
    predicted_delay = 0.0
    confidence = 0.85
    
    if _delay_model is not None:
        try:
            df_features = pd.DataFrame([{
                'vehicleId': vehicle_id,
                'routeId': route_id,
                'type': v_type,
                'distance': distance,
                'day_of_week': day_of_week,
                'month': month
            }])
            
            pred_delay = _delay_model.predict(df_features)[0]
            predicted_delay = float(round(max(pred_delay, 0.0), 1))
        except Exception as e:
            print(f"Delay model prediction error: {e}")
            predicted_delay = 0.5
    else:
        # Rule fallback
        predicted_delay = float(round((distance / 350.0) * (1.2 if day_of_week >= 5 else 0.8), 1))
        confidence = 0.65
        
    # Classify status
    if predicted_delay < 1.0:
        status = "On Time"
    elif predicted_delay < 3.0:
        status = "Minor Delay"
    else:
        status = "Major Delay"
        
    return DelayPredictionResponse(
        vehicle_id=vehicle_id,
        route_id=route_id,
        predicted_delay_hours=predicted_delay,
        confidence=confidence,
        status=status
    )

@router.post("/predict/price", response_model=PricePredictionResponse)
async def predict_price(req: PricePredictionRequest):
    global _price_model
    
    if _price_model is None:
        load_models()
        
    route_id = req.route_id
    volume = req.volume
    weight = req.weight
    date_str = req.date
    
    try:
        dt = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")
        
    day_of_week = dt.weekday()
    month = dt.month
    
    client = MongoClient(settings.MONGO_URI)
    db = client.get_default_database()
    route = db.routes.find_one({"routeId": route_id})
    client.close()
    
    if not route:
        raise HTTPException(status_code=404, detail=f"Route '{route_id}' not found")
        
    distance = route["distance"]
    base_rate = route["baseRate"]
    
    predicted_price = 0.0
    confidence = 0.85
    
    if _price_model is not None:
        try:
            df_features = pd.DataFrame([{
                'routeId': route_id,
                'distance': distance,
                'volume': volume,
                'weight': weight,
                'day_of_week': day_of_week,
                'month': month
            }])
            
            pred_price = _price_model.predict(df_features)[0]
            predicted_price = float(round(max(pred_price, 0.0), 0))
        except Exception as e:
            print(f"Price model prediction error: {e}")
            pricing_factor = 1.0 + (distance / 1000)
            predicted_price = float(round(volume * base_rate * pricing_factor, 0))
    else:
        # Fallback
        pricing_factor = 1.0 + (distance / 1000)
        predicted_price = float(round(volume * base_rate * pricing_factor * 1.05, 0))
        confidence = 0.65
        
    recommendation = f"Optimized target pricing is {predicted_price:,.0f} INR. This yields highest conversion probability based on historical orders."
    
    return PricePredictionResponse(
        route_id=route_id,
        suggested_price=predicted_price,
        confidence=confidence,
        recommendation=recommendation
    )

@router.post("/train", response_model=RetrainResponse)
async def train_models():
    try:
        metrics = run_training()
        load_models()
        return RetrainResponse(
            status="success",
            message="Machine learning models retrained successfully.",
            metrics=metrics
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to train models: {str(e)}")

@router.post("/optimize/consolidation")
async def optimize_consolidation(req: OptimizationRequest):
    try:
        shipments_dict = [s.dict() for s in req.shipments]
        vehicles_dict = [v.dict() for v in req.vehicles]
        result = optimize_load_consolidation(shipments_dict, vehicles_dict)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Load consolidation optimization failed: {str(e)}")
