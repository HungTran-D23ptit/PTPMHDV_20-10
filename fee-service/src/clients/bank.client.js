const http = require('http');
const https = require('https');
const { config } = require('../config');

const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 15,
  maxFreeSockets: 15,
  timeout: 4000,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 15,
  maxFreeSockets: 15,
  timeout: 4000,
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function callBankOnce(bankUrlStr, payload, idempotencyKey, timeoutMs) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL('/charges', bankUrlStr);
    } catch (err) {
      const error = new Error(`URL ngân hàng không hợp lệ: ${bankUrlStr}`);
      error.code = 'ECONNREFUSED';
      return reject(error);
    }

    const isHttps = parsedUrl.protocol === 'https:';
    const transport = isHttps ? https : http;
    const agent = isHttps ? httpsAgent : httpAgent;
    const bodyData = JSON.stringify(payload);

    let reqSent = false;
    let settled = false;

    const options = {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname,
      method: 'POST',
      agent,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyData),
        'Idempotency-Key': idempotencyKey,
        Connection: 'keep-alive',
      },
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const err = new Error('Hết thời gian chờ ngân hàng phản hồi (Timeout)');
      err.code = 'ETIMEDOUT';
      err.reqSent = reqSent;
      req.destroy();
      reject(err);
    }, timeoutMs);

    const req = transport.request(options, (res) => {
      let rawData = '';
      res.on('data', (chunk) => {
        rawData += chunk;
      });
      res.on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        let parsedBody = {};
        try {
          parsedBody = rawData ? JSON.parse(rawData) : {};
        } catch (_) {
          parsedBody = { raw: rawData };
        }
        resolve({
          statusCode: res.statusCode,
          body: parsedBody,
        });
      });
    });

    req.on('socket', (socket) => {
      if (!socket.connecting) {
        reqSent = true;
      } else {
        socket.once('connect', () => {
          reqSent = true;
        });
      }
    });

    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      err.reqSent = reqSent;
      reject(err);
    });

    req.write(bodyData);
    req.end();
  });
}

async function chargeWithResilience(paymentId, amount) {
  const { TOTAL_DEADLINE_MS, ATTEMPT_TIMEOUT_MS, MAX_ATTEMPTS } = config;
  const startTime = Date.now();
  const payload = { reference: paymentId, amount };

  let hasUncertainState = false;
  let lastErrorMessage = 'Lỗi không xác định khi gọi ngân hàng';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const elapsed = Date.now() - startTime;
    const remainingBudget = TOTAL_DEADLINE_MS - elapsed;

    if (remainingBudget < 250) {
      break;
    }

    const currentTimeout = Math.min(ATTEMPT_TIMEOUT_MS, remainingBudget);

    try {
      const response = await callBankOnce(config.BANK_URL, payload, paymentId, currentTimeout);
      const { statusCode, body } = response;

      if (statusCode === 201) {
        return {
          httpStatus: 201,
          status: 'PAID',
          chargeId: body.chargeId,
          message: 'Thanh toán học phí thành công. Ngân hàng xác nhận đã trừ tiền.',
        };
      }

      if (statusCode >= 400 && statusCode < 500) {
        const msg = body.error || `Ngân hàng từ chối giao dịch (HTTP ${statusCode})`;
        return {
          httpStatus: statusCode,
          status: 'FAILED',
          error: msg,
          message: msg,
        };
      }

      lastErrorMessage = body.error || `Ngân hàng trả lỗi HTTP ${statusCode} (chưa trừ tiền)`;
      if (attempt < MAX_ATTEMPTS && Date.now() - startTime + 150 < TOTAL_DEADLINE_MS) {
        await sleep(100 * attempt);
        continue;
      }
    } catch (err) {
      const code = err.code || '';

      if (
        code === 'ECONNREFUSED' ||
        code === 'ENOTFOUND' ||
        code === 'EHOSTUNREACH' ||
        code === 'EADDRNOTAVAIL'
      ) {
        lastErrorMessage = `Không kết nối được tới ngân hàng (${code}) - Chắc chắn chưa trừ tiền`;
        if (attempt === 1 && !hasUncertainState) {
          await sleep(100);
          continue;
        }
        break;
      }

      if (code === 'ETIMEDOUT') {
        hasUncertainState = true;
        lastErrorMessage =
          'Hết thời gian chờ ngân hàng phản hồi (Timeout) - Không biết đã trừ tiền hay chưa';
        break;
      }

      hasUncertainState = true;
      lastErrorMessage = `Đứt kết nối với ngân hàng khi đang chờ trả lời (${code || err.message}) - Không biết đã trừ tiền hay chưa`;

      if (attempt < MAX_ATTEMPTS && Date.now() - startTime + 150 < TOTAL_DEADLINE_MS) {
        await sleep(80 * attempt);
        continue;
      }
    }
  }

  if (hasUncertainState) {
    return {
      httpStatus: 504,
      status: 'PENDING',
      error: lastErrorMessage,
      message: lastErrorMessage,
    };
  }

  return {
    httpStatus: 503,
    status: 'FAILED',
    error: lastErrorMessage,
    message: lastErrorMessage,
  };
}

module.exports = {
  chargeWithResilience,
};
