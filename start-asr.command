#!/bin/bash
cd "$(dirname "$0")" || exit 1

if [ ! -x ".venv/bin/python" ]; then
  echo "Local ASR is not installed. Run install-local-asr.command first."
  read -r -p "Press Enter to close..."
  exit 1
fi

.venv/bin/python local_asr.py
status=$?
if [ "$status" -ne 0 ]; then
  read -r -p "The service stopped with an error. Press Enter to close..."
fi
exit "$status"
