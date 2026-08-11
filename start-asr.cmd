@echo off
setlocal
set "PYTHON_EXE=%~dp0.venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" (
  echo Local ASR is not installed.
  echo Please run install-local-asr.cmd first.
  pause
  exit /b 1
)
cd /d "%~dp0"
"%PYTHON_EXE%" local_asr.py
if errorlevel 1 pause
