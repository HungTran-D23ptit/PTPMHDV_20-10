const http = require('http');
const app = require('./src/app');
const { config } = require('./src/config');

const server = http.createServer(app);

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
  console.log(`Fee Service đang chạy tại http://localhost:${config.PORT}`);
  console.log(`Kết nối tới Ngân hàng (BANK_URL): ${config.BANK_URL}`);
});

server.listen(config.PORT);
