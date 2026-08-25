# Business Analytics for Road Logistics Space Optimization

This project is a multi-tier analytics platform designed to optimize available cargo space in road logistics, forecast demand, and predict vehicle underutilization before departure.

## Project Structure

The project is structured as a monorepo containing three core services:

1.  **`/frontend`**: React.js client interface styled with Tailwind CSS, showing charts (Chart.js) and active fleet space metrics.
2.  **`/backend`**: Node.js + Express API server managing authentication (JWT, bcrypt), bookings, routes, and vehicles stored in MongoDB.
3.  **`/analytics`**: Python FastAPI microservice that trains and serves Scikit-learn and Statsmodels models for predictive analytics.

---

## Getting Started

### Prerequisites
- Node.js (v18+)
- Python (v3.10+)
- MongoDB (running locally or a URI from MongoDB Atlas)

### 1. Run the Backend API
Navigate to the `backend` folder, install dependencies, set up your `.env`, and start the dev server:
```bash
cd backend
npm install
# Create a .env file with MongoDB connection URI and JWT_SECRET
npm run dev
```

### 2. Run the Python Analytics Engine
Navigate to the `analytics` folder, create a virtual environment, install dependencies, and run FastAPI:
```bash
cd analytics
python -m venv venv
venv\Scripts\activate      # On Windows
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

### 3. Run the React Frontend
Navigate to the `frontend` folder, install dependencies, and run Vite:
```bash
cd frontend
npm install
npm run dev
```
