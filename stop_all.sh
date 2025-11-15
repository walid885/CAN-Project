# stop_all.sh
#!/bin/bash
pkill -f stm32_can_simulator.py
docker compose down
echo "Stopped"