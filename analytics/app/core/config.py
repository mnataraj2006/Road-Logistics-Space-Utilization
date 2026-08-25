import os
from dotenv import load_dotenv

# Try to load backend .env file if it exists
backend_env = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "backend", ".env")
if os.path.exists(backend_env):
    load_dotenv(backend_env)
else:
    load_dotenv()

class Settings:
    MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017/road_logistics_space_utilization")
    PORT: int = int(os.getenv("ANALYTICS_PORT", 8000))

    
    # Base folder of analytics package
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    MODEL_DIR: str = os.path.join(os.path.dirname(BASE_DIR), "ml", "models")

settings = Settings()

# Ensure model directory exists
os.makedirs(settings.MODEL_DIR, exist_ok=True)
