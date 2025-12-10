#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
    echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}  ${GREEN}CAN Bus Monitoring System${NC}         ${CYAN}║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
}

launch_terminal() {
    local title=$1
    local color=$2
    local command=$3
    
    gnome-terminal --title="$title" -- bash -c "
        echo -e '${color}═══════════════════════════════════════${NC}';
        echo -e '${color}  $title${NC}';
        echo -e '${color}═══════════════════════════════════════${NC}';
        echo '';
        $command;
        exec bash
    " &
}

clear
print_header
echo ""

TARGET_IP="192.168.43.250"
INTERFACE=$(ip route | grep default | awk '{print $5}' | head -n1)
CURRENT_IP=$(ip -4 addr show $INTERFACE | grep -oP '(?<=inet\s)\d+(\.\d+){3}')

# Step 1: Network Check
echo -e "${YELLOW}[1/7]${NC} Checking Network Configuration..."
if [[ "$CURRENT_IP" == "$TARGET_IP" ]]; then
    echo -e "      ${GREEN}✓${NC} Interface $INTERFACE: $CURRENT_IP"
else
    echo -e "      ${RED}⚠ ERROR: IP Mismatch!${NC}"
    echo -e "      Current: $CURRENT_IP | Required: $TARGET_IP"
    echo -e "      ${YELLOW}Set Wi-Fi to Manual -> 192.168.43.250${NC}"
    exit 1
fi

# Step 2: Docker Elasticsearch
echo -e "${YELLOW}[2/7]${NC} Starting Elasticsearch & Grafana..."
docker-compose up -d
echo -e "      ${GREEN}✓${NC} Waiting for Elasticsearch..."
sleep 10

# Step 3: Configure Mosquitto
echo -e "${YELLOW}[3/7]${NC} Configuring Mosquitto..."
pkill mosquitto 2>/dev/null
rm -rf mosquitto_local
mkdir -p mosquitto_local/config

cat > mosquitto_local/config/mosquitto.conf << 'CONF'
listener 1883 0.0.0.0
allow_anonymous true
max_connections -1
CONF

mosquitto -c mosquitto_local/config/mosquitto.conf -d
sleep 2
echo -e "      ${GREEN}✓${NC} Mosquitto listening on 0.0.0.0:1883"

# Step 4: Firewall
echo -e "${YELLOW}[4/7]${NC} Configuring Firewall..."
if command -v ufw >/dev/null; then
    sudo ufw allow 1883/tcp >/dev/null 2>&1
    echo -e "      ${GREEN}✓${NC} Firewall configured"
else
    echo -e "      ${YELLOW}⚠${NC} UFW not found"
fi

# Step 5: MQTT Monitor
echo -e "${YELLOW}[5/7]${NC} Launching MQTT Monitor..."
launch_terminal "📡 MQTT Monitor" "$CYAN" "
    echo 'Listening: $TARGET_IP:1883';
    echo 'Topic: vehicule/can';
    echo '';
    mosquitto_sub -h $TARGET_IP -p 1883 -t 'vehicule/can' -v | while read -r line; do
        echo \"\$(date '+%H:%M:%S') \$line\"
    done
"
sleep 1
echo -e "      ${GREEN}✓${NC} Monitor started"

# Step 6: Backend
echo -e "${YELLOW}[6/7]${NC} Launching Backend..."
launch_terminal "🔧 CAN Backend" "$BLUE" "
    cd backend
    MQTT_BROKER=$TARGET_IP MQTT_PORT=1883 ES_HOST=localhost:9200 node server.js
"
sleep 2
echo -e "      ${GREEN}✓${NC} Backend started"

# Step 7: Frontend
echo -e "${YELLOW}[7/7]${NC} Launching Frontend..."
launch_terminal "🎨 CAN Frontend" "$PURPLE" "
    cd frontend
    npm run dev
"
sleep 2
echo -e "      ${GREEN}✓${NC} Frontend started"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          System Ready!                 ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Services:${NC}"
echo -e "  Frontend:       ${GREEN}http://localhost:5173${NC}"
echo -e "  Backend:        ${GREEN}http://localhost:5000${NC}"
echo -e "  Elasticsearch:  ${GREEN}http://localhost:9200${NC}"
echo -e "  Grafana:        ${GREEN}http://localhost:3001${NC} (admin/admin)"
echo ""
echo -e "${CYAN}Network:${NC}"
echo -e "  IP:             ${GREEN}$CURRENT_IP${NC}"
echo -e "  MQTT:           ${GREEN}$TARGET_IP:1883${NC}"
echo -e "  Topic:          ${GREEN}vehicule/can${NC}"
echo ""
echo -e "${YELLOW}Test command:${NC}"
echo -e "  mosquitto_pub -h $TARGET_IP -t 'vehicule/can' -m '{\"id\":999,\"car\":1,\"canId\":\"0x123\",\"speed\":120,\"temp\":80,\"fuel\":60,\"pressure\":240}'"
echo ""
echo -e "${RED}Press Ctrl+C to exit${NC}"
echo ""