@echo off
setlocal
cd /d "%~dp0"

set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
if not exist "%PYTHON_EXE%" (
  echo Python 3.11 was not found: %PYTHON_EXE%
  echo Install Python 3.11 first, then run this file again.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  "%PYTHON_EXE%" -m venv .venv
  if errorlevel 1 goto :failed
)

".venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto :failed
".venv\Scripts\python.exe" -m pip install -r requirements-local-asr.txt
if errorlevel 1 goto :failed

echo.
echo Local ASR installation completed.
pause
exit /b 0

:failed
echo.
echo Local ASR installation failed.
pause
exit /b 1
