# Orchestrator Script for Road Logistics Space Optimization Platform

Clear-Host
Write-Host "==========================================================================" -ForegroundColor Green
Write-Host "        ROAD LOGISTICS SPACE OPTIMIZATION - SERVICE ORCHESTRATOR        " -ForegroundColor Green
Write-Host "==========================================================================" -ForegroundColor Green
Write-Host ""

# Ensure backend dependencies are ready
if (-not (Test-Path "backend\node_modules")) {
    Write-Host "Backend dependencies not found. Installing..." -ForegroundColor Yellow
    Start-Process powershell -Wait -ArgumentList "-Command", "cd backend; npm install"
}

# Ensure frontend dependencies are ready
if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "Frontend dependencies not found. Installing..." -ForegroundColor Yellow
    Start-Process powershell -Wait -ArgumentList "-Command", "cd frontend; npm install"
}

# Ensure Python Virtual Environment is ready
if (-not (Test-Path "analytics\venv")) {
    Write-Host "Python virtual environment not found. Setting up..." -ForegroundColor Yellow
    Start-Process powershell -Wait -ArgumentList "-Command", "cd analytics; python -m venv venv; venv\Scripts\pip install -r requirements.txt"
}

# 1. Start Express Backend
Write-Host "[1/3] Launching Express Backend API (Port 5000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Title 'Logistics API Gateway'; cd backend; npm run dev"

# Wait a couple of seconds for MongoDB memory server to bind
Start-Sleep -Seconds 3

# 2. Start Python FastAPI Analytics Engine
Write-Host "[2/3] Launching Python FastAPI Engine (Port 8000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Title 'FastAPI Analytics Engine'; cd analytics; venv\Scripts\activate; python -m uvicorn app.main:app --reload --port 8000"

# 3. Start React Frontend Dashboard
Write-Host "[3/3] Launching React Client Dashboard..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Title 'React Vite Client'; cd frontend; npm run dev"

Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Green
Write-Host "  Success: All services launched! Check active terminal windows for logs." -ForegroundColor Green
Write-Host "==========================================================================" -ForegroundColor Green
Write-Host "  - Express Backend API Gateway   : http://localhost:5000" -ForegroundColor White
Write-Host "  - FastAPI Analytics API         : http://localhost:8000" -ForegroundColor White
Write-Host "  - React Dashboard Application   : http://localhost:5173" -ForegroundColor White
Write-Host "==========================================================================" -ForegroundColor Green
