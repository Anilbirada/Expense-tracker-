@echo off
title Expense Tracker — Smart Personal Finance System (Developed by Anil Biradar)
echo ============================================================================
echo   EXPENSE TRACKER — SMART PERSONAL FINANCE MANAGEMENT SYSTEM
echo   Developed by Anil Biradar
echo ============================================================================
echo.

cd /d "%~dp0"

echo [1/2] Starting FastAPI Backend Server on http://127.0.0.1:8000 ...
start "Expense Tracker Backend" cmd /k "cd /d "%~dp0backend" && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

echo [2/2] Starting React + Vite Frontend Server on http://127.0.0.1:5173 ...
start "Expense Tracker Frontend" cmd /k "cd /d "%~dp0frontend" && npm.cmd run dev -- --host 127.0.0.1 --port 5173"

timeout /t 3 /nobreak >nul
start http://127.0.0.1:5173

echo.
echo Both Backend and Frontend servers are launching!
echo Web App: http://127.0.0.1:5173
echo API Docs: http://127.0.0.1:8000/docs
pause
