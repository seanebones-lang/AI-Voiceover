#!/bin/bash
set -e

# Start Python XTTS sidecar in background
cd /app/services/xtts
python main.py &
XTTS_PID=$!

# Start Next.js app
cd /app
npm start &
NEXTJS_PID=$!

# Wait for either process to exit
wait -n

# Exit with status of process that exited first
exit $?
