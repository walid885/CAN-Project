docker-compose up -d

cd backend && npm install && cd ..
cd frontend && npm install && cd ..

python3 stm32_can_simulator.py 1 &
python3 stm32_can_simulator.py 2 &

cd backend && node server.js &
cd frontend && npm run dev &

wait
