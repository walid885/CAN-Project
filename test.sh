#!/bin/bash

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TARGET_IP="192.168.43.250"
TOPIC="vehicule/can"

clear
echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}  ${GREEN}MQTT Monitor - vehicule/can${NC}        ${CYAN}║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Broker:${NC} $TARGET_IP:1883"
echo -e "${YELLOW}Topic:${NC}  $TOPIC"
echo ""
echo -e "${GREEN}Waiting for messages...${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Subscribe and display messages with timestamps
mosquitto_sub -h $TARGET_IP -p 1883 -t "$TOPIC" -v | while read -r line; do
    echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $line"
done