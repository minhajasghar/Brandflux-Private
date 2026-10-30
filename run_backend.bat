@echo off
echo Starting Brandflux Backend on http://localhost:8000 ...
cd /d "%~dp0backend"
call venv\Scripts\activate.bat
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause

