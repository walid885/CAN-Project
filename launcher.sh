#!/bin/bash
set -e

echo "======================================"
echo "  CAN Bus Monitor - System Launcher"
echo "======================================"
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check prerequisites
echo "Checking prerequisites..."
command -v docker >/dev/null 2>&1 || { echo -e "${RED}Docker not found${NC}"; exit 1; }
command -v node >/dev/null 2>&1 || { echo -e "${RED}Node.js not found${NC}"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo -e "${RED}Python3 not found${NC}"; exit 1; }
echo -e "${GREEN}✓ All prerequisites met${NC}"
echo ""

# Clean up any existing processes
echo "Cleaning up existing processes..."
if [ -f .pids ]; then
    read -r p1 p2 p3 p4 < .pids
    kill $p1 $p2 $p3 $p4 2>/dev/null || true
    rm -f .pids
fi

# Kill processes on required ports
lsof -ti:5000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
echo -e "${GREEN}✓ Ports cleaned${NC}"
echo ""

# Install dependencies
if [ ! -d "backend/node_modules" ]; then
    echo "Installing backend dependencies..."
    cd backend && npm install && cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Start Docker services
echo "Starting Docker services..."
docker compose down 2>/dev/null
docker compose up -d

echo "Waiting for services to be healthy..."
sleep 20

# Check Elasticsearch
until curl -s http://localhost:9200/_cluster/health >/dev/null 2>&1; do
    echo "Waiting for Elasticsearch..."
    sleep 2
done
echo -e "${GREEN}✓ Elasticsearch ready${NC}"

# Check MQTT
until timeout 2 bash -c "</dev/tcp/localhost/1884" 2>/dev/null; do
    echo "Waiting for MQTT..."
    sleep 2
done
echo -e "${GREEN}✓ MQTT ready${NC}"


# Start backend
echo ""
echo "Starting backend..."
cd backend
npm start > ../logs_backend.log 2>&1 &
BACKEND_PID=$!
cd ..
sleep 5

# Verify backend is running
if ! curl -s http://localhost:5000/api/stats >/dev/null 2>&1; then
    echo -e "${RED}✗ Backend failed to start${NC}"
    cat logs_backend.log
    kill $PID1 $PID2 $BACKEND_PID 2>/dev/null
    docker compose down
    exit 1
fi
echo -e "${GREEN}✓ Backend started (PID: $BACKEND_PID)${NC}"

# Start frontend
echo ""
echo "Starting frontend..."
cd frontend
npm run dev > ../logs_frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..
sleep 3
echo -e "${GREEN}✓ Frontend started (PID: $FRONTEND_PID)${NC}"

echo ""
echo "======================================"
echo "  System Running Successfully!"
echo "======================================"
echo ""
echo -e "${YELLOW}Access Points:${NC}"
echo "  Frontend:      http://localhost:5173"
echo "  Backend API:   http://localhost:5000"
echo "  Grafana:       http://localhost:3001 (admin/admin)"
echo "  Elasticsearch: http://localhost:9200"
echo ""
echo -e "${YELLOW}Process IDs:${NC}"
echo "  Node 1:   $PID1"
echo "  Node 2:   $PID2"
echo "  Backend:  $BACKEND_PID"
echo "  Frontend: $FRONTEND_PID"
echo ""
echo -e "${YELLOW}Logs:${NC}"
echo "  tail -f logs_node1.log"
echo "  tail -f logs_backend.log"
echo "  tail -f logs_frontend.log"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Save PIDs
echo "$PID1 $PID2 $BACKEND_PID $FRONTEND_PID" > .pids

# Trap exit
trap "echo ''; echo 'Stopping all services...'; kill $PID1 $PID2 $BACKEND_PID $FRONTEND_PID 2>/dev/null; docker compose down; rm -f .pids; echo 'All services stopped'; exit 0" EXIT INT TERM

# Keep script running
tail -f logs_frontend.log