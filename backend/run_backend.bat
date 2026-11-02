@echo off
echo ===================================================
echo Starting Brandflux Backend on http://localhost:8000
echo ===================================================
cd /d "%~dp0"

:: Free port 8000 if another stale instance is still bound
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    echo Freeing port 8000 from stale process PID %%a...
    taskkill /F /PID %%a >nul 2>&1
)

call venv\Scripts\activate.bat
python -m uvicorn main:app --host 0.0.0.0 --port 8000
pause

