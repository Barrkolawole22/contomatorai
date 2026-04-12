#!/bin/bash

echo "🚀 Starting Content Automation SaaS Development Environment"

# Check if MongoDB is accessible
echo "📡 Checking MongoDB connection..."
node -e "
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://contentautomator:N2SMjXvGIs3QEKXr@contentautomator.tvofqju.mongodb.net/?retryWrites=true&w=majority&appName=contentautomator')
  .then(() => { console.log('✅ MongoDB connected'); process.exit(0); })
  .catch(() => { console.log('❌ MongoDB connection failed'); process.exit(1); });
"

if [ $? -eq 0 ]; then
  echo "🗄️ Initializing database..."
  cd backend && npm run db:init
  
  echo "🌱 Seeding test data..."
  npm run db:seed
  
  echo "🔧 Starting backend server..."
  npm run dev &
  BACKEND_PID=$!
  
  echo "⏳ Waiting for backend to start..."
  sleep 5
  
  echo "🎨 Starting frontend server..."
  cd ../frontend && npm run dev &
  FRONTEND_PID=$!
  
  echo "✅ Development environment started!"
  echo "🔗 Frontend: http://localhost:3000"
  echo "🔗 Backend: http://localhost:5000"
  echo "📧 Test login: test@contentautomation.com / testpassword123"
  echo ""
  echo "Press Ctrl+C to stop all servers"
  
  # Wait for interrupt
  trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT
  wait
else
  echo "❌ Cannot connect to MongoDB. Please check your connection."
  exit 1
fi