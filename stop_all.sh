# stop_all.sh (in CAN-Project/)
#!/bin/bash

pkill -f stm32_can_simulator.py
docker-compose down
echo "All services stopped"