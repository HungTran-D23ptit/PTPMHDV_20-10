const http = require('http');
const app = require('./src/app');
const { config } = require('./src/config');
const { stats } = require('./src/store/bank.store');

const server = http.createServer(app);

server.keepAliveTimeout = 5000;
server.headersTimeout = 6000;

server.on('connection', (socket) => {
  stats.connections++;
  console.log(
    `[Bank][TCP] Kết nối TCP mới #${stats.connections} từ ${socket.remoteAddress}:${socket.remotePort}`
  );
});

server.on('error', async (err) => {
  if (err.code === 'EADDRINUSE') {
    try {
      await fetch(`http://localhost:${config.PORT}/shutdown`, { method: 'POST' });
    } catch (_) {}
    setTimeout(() => {
      server.listen(config.PORT);
    }, 250);
  } else {
    throw err;
  }
});

server.on('listening', () => {
  console.log(`Ngân hàng giả lập đang chạy tại http://localhost:${config.PORT}`);
  console.log(
    `Cấu hình: DELAY_MS=${config.DELAY_MS}, FAIL_RATE=${config.FAIL_RATE}, DROP_RATE=${config.DROP_RATE}`
  );
});

server.listen(config.PORT);
