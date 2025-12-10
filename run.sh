docker-compose up -d

cd backend && npm install && cd ..
cd frontend && npm install && cd ..


cd backend && node server.js &
cd frontend && npm run dev &

wait
