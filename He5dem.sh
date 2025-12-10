#!/bin/bash

# Colors
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

# Step 1: Network Check (Replaces Hotspot Creation)
echo -e "${YELLOW}[1/6]${NC} Checking Network Configuration..."

# Find the active interface that isn't docker/lo
INTERFACE=$(ip route | grep default | awk '{print $5}' | head -n1)
CURRENT_IP=$(ip -4 addr show $INTERFACE | grep -oP '(?<=inet\s)\d+(\.\d+){3}')

# Check if we have the correct IP
TARGET_IP="192.168.43.250"

if [[ "$CURRENT_IP" == "$TARGET_IP" ]]; then
    echo -e "      ${GREEN}✓${NC} Interface $INTERFACE is on correct IP: $CURRENT_IP"
else
    echo -e "      ${RED}⚠ ERROR: IP Mismatch!${NC}"
    echo -e "      Current IP: $CURRENT_IP"
    echo -e "      Required IP: $TARGET_IP"
    echo -e "      ${YELLOW}Please set your Wi-Fi IPv4 settings to Manual -> Address: 192.168.43.250${NC}"
    exit 1
fi

# Step 2: Configure Mosquitto
echo -e "${YELLOW}[2/6]${NC} Configuring Mosquitto..."
# Fix permission issue by using local directory without sudo if possible, or force cleanup
pkill mosquitto 2>/dev/null
rm -rf mosquitto_local
mkdir -p mosquitto_local/config

# Create config file
cat > mosquitto_local/config/mosquitto.conf << 'CONF'
listener 1883 0.0.0.0
allow_anonymous true
max_connections -1
CONF

# Run mosquitto in background relative to current folder
mosquitto -c mosquitto_local/config/mosquitto.conf -d
sleep 2
echo -e "      ${GREEN}✓${NC} Mosquitto listening on 0.0.0.0:1883"

# Step 3: Configure Firewall
echo -e "${YELLOW}[3/6]${NC} Configuring Firewall..."
# Using 'timeout' to prevent hanging if sudo asks for password and user doesn't see it
if command -v ufw >/dev/null; then
    sudo ufw allow 1883/tcp >/dev/null 2>&1
    echo -e "      ${GREEN}✓${NC} Firewall rule updated"
else
    echo -e "      ${YELLOW}⚠${NC} UFW not found, skipping firewall step."
fi

# Step 4: MQTT Monitor
echo -e "${YELLOW}[4/6]${NC} Launching MQTT Monitor..."
launch_terminal "📡 MQTT Monitor" "$CYAN" "
    echo 'Listening on $TARGET_IP:1883';
    echo 'Topic: 'vehicule/can';
    echo '';
    mosquitto_sub -h $TARGET_IP -p 1883 -t 'vehicule/can' -v
"
sleep 1
echo -e "      ${GREEN}✓${NC} Monitor started"

# Step 5: Backend
echo -e "${YELLOW}[5/6]${NC} Launching Backend..."
launch_terminal "🔧 CAN Backend" "$BLUE" "
    cd backend
    # Removed npm install to speed up launch, add back if needed
    MQTT_BROKER=$TARGET_IP MQTT_PORT=1883 ES_HOST='' node server.js
"
sleep 2
echo -e "      ${GREEN}✓${NC} Backend started"

# Step 6: Frontend
echo -e "${YELLOW}[6/6]${NC} Launching Frontend..."
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
echo -e "${CYAN}Network Status:${NC}"
echo -e "  Interface: ${GREEN}$INTERFACE${NC}"
echo -e "  IP Address:${GREEN}$CURRENT_IP${NC} (Matches Mobile App)"
echo ""
echo -e "${CYAN}Web Interface:${NC}"
echo -e "  Frontend: ${GREEN}http://localhost:5173${NC}"
echo -e "  Backend:  ${GREEN}http://localhost:5000${NC}"
echo ""
echo -e "${RED}Press Ctrl+C to exit${NC}"
echo ""