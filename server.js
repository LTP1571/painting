const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

let drawHistory = [];
let users = {};

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
    socket.broadcast.emit('draw', data);
  });

  // Xóa canvas
  socket.on('clear', () => {
    drawHistory = [];
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

server.listen(PORT, () => {
  console.log(`\n🎨 Bảng vẽ cộng đồng đang chạy tại: http://localhost:${PORT}\n`);
});
