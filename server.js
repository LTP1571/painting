const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

let drawHistory = [];
let users = {};
let db = null;

// Kết nối MongoDB
async function connectDB() {
  if (!MONGODB_URI) {
    console.log('⚠️  Không có MONGODB_URI, chạy không có DB (history sẽ mất khi restart)');
    return;
  }
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db('drawingapp');
    console.log('✅ Đã kết nối MongoDB Atlas');

    // Load lịch sử vẽ từ DB khi khởi động
    const saved = await db.collection('history').findOne({ _id: 'canvas' });
    if (saved && saved.strokes) {
      drawHistory = saved.strokes;
      console.log(`📂 Đã load ${drawHistory.length} nét vẽ từ DB`);
    }
  } catch (err) {
    console.error('❌ Lỗi kết nối MongoDB:', err.message);
  }
}

// Lưu history vào DB (debounce 2s để không ghi quá nhiều)
let saveTimer = null;
function saveHistory() {
  if (!db) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await db.collection('history').updateOne(
        { _id: 'canvas' },
        { $set: { strokes: drawHistory, updatedAt: new Date() } },
        { upsert: true }
      );
    } catch (err) {
      console.error('❌ Lỗi lưu DB:', err.message);
    }
  }, 2000);
}

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  const userId = socket.id.slice(0, 4).toUpperCase();
  users[socket.id] = { id: userId, color: randomColor() };
  console.log(`✅ ${userId} đã vào (${Object.keys(users).length} người)`);

  // Gửi lịch sử vẽ cho người mới vào
  socket.emit('init', {
    history: drawHistory,
    me: users[socket.id],
    users: Object.values(users)
  });

  // Thông báo cho mọi người
  io.emit('userList', Object.values(users));

  // Nhận lệnh vẽ, lưu history, broadcast cho người khác
  socket.on('draw', (data) => {
    drawHistory.push(data);
    if (drawHistory.length > 8000) drawHistory = drawHistory.slice(-8000);
    saveHistory();
    socket.broadcast.emit('draw', data);
  });

  // Xóa canvas
  socket.on('clear', () => {
    drawHistory = [];
    saveHistory();
    socket.broadcast.emit('clear');
    console.log(`🗑️  ${userId} đã xóa canvas`);
  });

  // Vị trí con trỏ
  socket.on('cursor', (pos) => {
    socket.broadcast.emit('cursor', {
      id: socket.id,
      userId,
      color: users[socket.id]?.color,
      ...pos
    });
  });

  socket.on('disconnect', () => {
    console.log(`❌ ${userId} đã rời`);
    delete users[socket.id];
    io.emit('userList', Object.values(users));
    io.emit('removeCursor', socket.id);
  });
});

function randomColor() {
  const colors = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f43f5e','#06b6d4'];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Khởi động server sau khi kết nối DB
connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`\n🎨 Bảng vẽ cộng đồng đang chạy tại: http://localhost:${PORT}\n`);
  });
});
