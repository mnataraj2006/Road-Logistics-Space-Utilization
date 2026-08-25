from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import router

app = FastAPI(
    title="Road Logistics Space Optimization Analytics Engine",
    description="Python predictive analytics engine using scikit-learn & statsmodels",
    version="1.0.0"
)

# CORS configurations
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register endpoints
app.include_router(router)

@app.get("/")
def read_root():
    return {
        "status": "UP",
        "service": "Road Logistics Space Optimization Analytics Engine",
        "description": "Exposes endpoints for booking demand forecasting, vehicle space occupancy predictions, and ML model retraining."
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
