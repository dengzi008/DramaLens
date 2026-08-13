#!/bin/bash
set -u
cd "$(dirname "$0")" || exit 1

PYTHON_EXE=""
for candidate in python3.11 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PYTHON_EXE="$candidate"
    break
  fi
done

if [ -z "$PYTHON_EXE" ]; then
  echo "Python 3.11 was not found. Install Python 3.11, then run this file again."
  read -r -p "Press Enter to close..."
  exit 1
fi

if [ ! -x ".venv/bin/python" ]; then
  "$PYTHON_EXE" -m venv .venv || exit 1
fi

.venv/bin/python -m pip install --upgrade pip || exit 1
.venv/bin/python -m pip install -r requirements-local-asr.txt || exit 1

echo
echo "DramaLens local ASR installation completed."
echo "For desktop-app audio, install BlackHole 2ch and configure macOS audio output."
read -r -p "Press Enter to close..."
