# start_all.sh (in CAN-Project/)
#!/bin/bash
set -e

echo "Starting Docker services..."
docker-compose up -d

echo "Waiting for services..."
sleep 15

echo "Starting STM32 simulators..."
python3 stm32_can_simulator.py 1 localhost 10 &
PID1=$!
python3 stm32_can_simulator.py 2 localhost 10 &
PID2=$!

echo "Node 1: PID $PID1"
echo "Node 2: PID $PID2"
echo "Press Ctrl+C to stop"

trap "kill $PID1 $PID2 2>/dev/null; docker-compose down" EXIT
wait