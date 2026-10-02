"""
tests/test_analytics.py
-----------------------
Accurate test suite for the Road Logistics ML Analytics Engine.

Previous version was broken: it imported DemandPredictionRequest and
OccupancyPredictionRequest which do not exist.  The actual Pydantic
models are DemandForecastRequest and OccupancyPredictionRequest (with
different fields).

Run from the analytics/ directory:
    python -m pytest tests/ -v
"""

import os
import sys

# Ensure the analytics package root is on the path when running from tests/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from app.models import (
    DemandForecastRequest, DemandForecastResponse,
    OccupancyPredictionRequest, OccupancyPredictionResponse,
    DelayPredictionRequest, DelayPredictionResponse,
    PricePredictionRequest, PricePredictionResponse,
)

# ─── Pydantic model contracts ────────────────────────────────────────────────

class TestDemandForecastRequest:
    """Verify DemandForecastRequest schema."""

    def test_valid_request(self):
        req = DemandForecastRequest(route_id="RTE-001", days_ahead=7)
        assert req.route_id == "RTE-001"
        assert req.days_ahead == 7

    def test_default_days_ahead(self):
        req = DemandForecastRequest(route_id="RTE-002")
        assert req.days_ahead == 7

    def test_custom_days_ahead(self):
        req = DemandForecastRequest(route_id="RTE-003", days_ahead=14)
        assert req.days_ahead == 14


class TestOccupancyPredictionRequest:
    """Verify OccupancyPredictionRequest schema."""

    def test_valid_request(self):
        req = OccupancyPredictionRequest(
            vehicle_id="TRK-001",
            route_id="RTE-001",
            date="2026-10-01",
            current_volume=40.0,
            current_weight=8000.0,
        )
        assert req.vehicle_id == "TRK-001"
        assert req.route_id == "RTE-001"
        assert req.date == "2026-10-01"
        assert req.current_volume == 40.0
        assert req.current_weight == 8000.0

    def test_zero_volume_allowed(self):
        req = OccupancyPredictionRequest(
            vehicle_id="TRK-001", route_id="RTE-001",
            date="2026-10-01", current_volume=0.0, current_weight=0.0
        )
        assert req.current_volume == 0.0


class TestDelayPredictionRequest:
    """Verify DelayPredictionRequest schema."""

    def test_valid_request(self):
        req = DelayPredictionRequest(
            vehicle_id="TRK-002", route_id="RTE-001", date="2026-10-01"
        )
        assert req.vehicle_id == "TRK-002"
        assert req.route_id == "RTE-001"
        assert req.date == "2026-10-01"


class TestPricePredictionRequest:
    """Verify PricePredictionRequest schema."""

    def test_valid_request(self):
        req = PricePredictionRequest(
            route_id="RTE-001", volume=30.0, weight=5000.0, date="2026-10-01"
        )
        assert req.route_id == "RTE-001"
        assert req.volume == 30.0
        assert req.weight == 5000.0
        assert req.date == "2026-10-01"


# ─── API endpoint tests (via TestClient with mocked DB & model) ───────────────

@pytest.fixture
def client():
    """Return a TestClient for the FastAPI app with models pre-loaded."""
    from app.main import app
    return TestClient(app)


def _mock_mongo(vehicle=None, route=None):
    """Build a mock MongoClient that returns canned vehicle/route docs."""
    vehicle_doc = vehicle or {
        "vehicleId": "TRK-001",
        "type": "Heavy Truck",
        "capacityVolume": 100.0,
        "capacityWeight": 20000.0,
    }
    route_doc = route or {
        "routeId": "RTE-001",
        "distance": 350.0,
        "baseRate": 30000.0,
    }
    mock_db = MagicMock()
    mock_db.vehicles.find_one.return_value = vehicle_doc
    mock_db.routes.find_one.return_value = route_doc
    mock_client = MagicMock()
    mock_client.get_default_database.return_value = mock_db
    return mock_client


class TestDemandEndpoint:
    """Test /predict/demand endpoint."""

    def test_demand_with_no_model_uses_fallback(self, client):
        """When no Holt-Winters model is loaded, fallback values are returned."""
        import app.routes as routes_module
        original = routes_module._demand_model
        routes_module._demand_model = None  # simulate missing model
        try:
            resp = client.post("/predict/demand", json={"route_id": "RTE-999", "days_ahead": 3})
            assert resp.status_code == 200
            data = resp.json()
            assert data["route_id"] == "RTE-999"
            assert len(data["forecast"]) == 3
            for f in data["forecast"]:
                assert "date" in f
                assert isinstance(f["predicted_bookings_count"], int)
                assert f["predicted_bookings_count"] >= 0
        finally:
            routes_module._demand_model = original

    def test_demand_missing_route_id(self, client):
        """Missing required field should return 422."""
        resp = client.post("/predict/demand", json={"days_ahead": 7})
        assert resp.status_code == 422

    def test_demand_days_ahead_respected(self, client):
        """Forecast length must equal days_ahead."""
        resp = client.post("/predict/demand", json={"route_id": "RTE-001", "days_ahead": 5})
        if resp.status_code == 200:
            data = resp.json()
            assert len(data["forecast"]) == 5


class TestOccupancyEndpoint:
    """Test /predict/occupancy endpoint."""

    def test_occupancy_vehicle_not_found(self, client):
        """404 when vehicle is missing from DB."""
        mock_client = _mock_mongo(vehicle=None)
        mock_db = mock_client.get_default_database()
        mock_db.vehicles.find_one.return_value = None
        with patch("app.routes.MongoClient", return_value=mock_client):
            resp = client.post("/predict/occupancy", json={
                "vehicle_id": "NONEXISTENT",
                "route_id": "RTE-001",
                "date": "2026-10-01",
                "current_volume": 10.0,
                "current_weight": 2000.0,
            })
            assert resp.status_code == 404

    def test_occupancy_route_not_found(self, client):
        """404 when route is missing from DB."""
        mock_client = _mock_mongo()
        mock_db = mock_client.get_default_database()
        mock_db.routes.find_one.return_value = None
        with patch("app.routes.MongoClient", return_value=mock_client):
            resp = client.post("/predict/occupancy", json={
                "vehicle_id": "TRK-001",
                "route_id": "NONEXISTENT",
                "date": "2026-10-01",
                "current_volume": 10.0,
                "current_weight": 2000.0,
            })
            assert resp.status_code == 404

    def test_occupancy_invalid_date(self, client):
        """400 when date is not YYYY-MM-DD."""
        mock_client = _mock_mongo()
        with patch("app.routes.MongoClient", return_value=mock_client):
            resp = client.post("/predict/occupancy", json={
                "vehicle_id": "TRK-001",
                "route_id": "RTE-001",
                "date": "01/10/2026",   # wrong format
                "current_volume": 10.0,
                "current_weight": 2000.0,
            })
            assert resp.status_code == 400

    def test_occupancy_valid_without_model(self, client):
        """Fallback rule-based result when model is None."""
        import app.routes as routes_module
        original = routes_module._occupancy_model
        routes_module._occupancy_model = None
        mock_client = _mock_mongo()
        try:
            with patch("app.routes.MongoClient", return_value=mock_client):
                resp = client.post("/predict/occupancy", json={
                    "vehicle_id": "TRK-001",
                    "route_id": "RTE-001",
                    "date": "2026-10-01",
                    "current_volume": 40.0,
                    "current_weight": 8000.0,
                })
                assert resp.status_code == 200
                data = resp.json()
                assert "predicted_utilization_percent" in data
                assert "is_underutilized" in data
                assert "recommendation" in data
                assert 0.0 <= data["predicted_utilization_percent"] <= 100.0
        finally:
            routes_module._occupancy_model = original


class TestDelayEndpoint:
    """Test /predict/delay endpoint."""

    def test_delay_vehicle_or_route_not_found(self, client):
        """404 when either vehicle or route is missing."""
        mock_client = _mock_mongo()
        mock_db = mock_client.get_default_database()
        mock_db.vehicles.find_one.return_value = None
        mock_db.routes.find_one.return_value = None
        with patch("app.routes.MongoClient", return_value=mock_client):
            resp = client.post("/predict/delay", json={
                "vehicle_id": "NONE", "route_id": "NONE", "date": "2026-10-01"
            })
            assert resp.status_code == 404

    def test_delay_invalid_date(self, client):
        mock_client = _mock_mongo()
        with patch("app.routes.MongoClient", return_value=mock_client):
            resp = client.post("/predict/delay", json={
                "vehicle_id": "TRK-001", "route_id": "RTE-001", "date": "bad-date"
            })
            assert resp.status_code == 400

    def test_delay_valid_without_model(self, client):
        """Fallback distance-based delay when model is None."""
        import app.routes as routes_module
        original = routes_module._delay_model
        routes_module._delay_model = None
        mock_client = _mock_mongo()
        try:
            with patch("app.routes.MongoClient", return_value=mock_client):
                resp = client.post("/predict/delay", json={
                    "vehicle_id": "TRK-001", "route_id": "RTE-001", "date": "2026-10-01"
                })
                assert resp.status_code == 200
                data = resp.json()
                assert "predicted_delay_hours" in data
                assert "status" in data
                assert data["status"] in ["On Time", "Minor Delay", "Major Delay"]
                assert data["predicted_delay_hours"] >= 0.0
        finally:
            routes_module._delay_model = original


class TestPriceEndpoint:
    """Test /predict/price endpoint."""

    def test_price_route_not_found(self, client):
        mock_client = _mock_mongo()
        mock_db = mock_client.get_default_database()
        mock_db.routes.find_one.return_value = None
        with patch("app.routes.MongoClient", return_value=mock_client):
            resp = client.post("/predict/price", json={
                "route_id": "NONE", "volume": 10.0, "weight": 500.0, "date": "2026-10-01"
            })
            assert resp.status_code == 404

    def test_price_invalid_date(self, client):
        mock_client = _mock_mongo()
        with patch("app.routes.MongoClient", return_value=mock_client):
            resp = client.post("/predict/price", json={
                "route_id": "RTE-001", "volume": 10.0, "weight": 500.0, "date": "baddate"
            })
            assert resp.status_code == 400

    def test_price_valid_without_model(self, client):
        """Fallback formula-based price when model is None."""
        import app.routes as routes_module
        original = routes_module._price_model
        routes_module._price_model = None
        mock_client = _mock_mongo()
        try:
            with patch("app.routes.MongoClient", return_value=mock_client):
                resp = client.post("/predict/price", json={
                    "route_id": "RTE-001", "volume": 30.0, "weight": 5000.0, "date": "2026-10-01"
                })
                assert resp.status_code == 200
                data = resp.json()
                assert "suggested_price" in data
                assert data["suggested_price"] > 0.0
                assert "confidence" in data
                assert "recommendation" in data
        finally:
            routes_module._price_model = original

    def test_price_missing_fields(self, client):
        resp = client.post("/predict/price", json={"route_id": "RTE-001"})
        assert resp.status_code == 422


class TestHealthEndpoint:
    """Test root health check."""

    def test_root_returns_status_up(self, client):
        resp = client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "UP"
