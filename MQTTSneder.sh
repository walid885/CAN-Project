#!/bin/bash

while true; do
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
  SPEED=$((RANDOM % 60 + 60))
  TEMP=$((RANDOM % 30 + 60))
  FUEL=$((RANDOM % 100))
  PRESSURE=$((RANDOM % 50 + 200))
  
  mosquitto_pub -h localhost -t "can/frames" -m "{\"id\":$(date +%s%N | cut -b1-13),\"car\":1,\"canId\":\"0x123\",\"speed\":$SPEED,\"temp\":$TEMP,\"fuel\":$FUEL,\"pressure\":$PRESSURE,\"timestamp\":\"$TIMESTAMP\"}"
  
  sleep 0.5
  
  SPEED=$((RANDOM % 60 + 60))
  TEMP=$((RANDOM % 30 + 60))
  FUEL=$((RANDOM % 100))
  PRESSURE=$((RANDOM % 50 + 200))
  
  mosquitto_pub -h localhost -t "can/frames" -m "{\"id\":$(date +%s%N | cut -b1-13),\"car\":2,\"canId\":\"0x456\",\"speed\":$SPEED,\"temp\":$TEMP,\"fuel\":$FUEL,\"pressure\":$PRESSURE,\"timestamp\":\"$TIMESTAMP\"}"
  
  sleep 0.5
done