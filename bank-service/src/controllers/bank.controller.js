const { config, updateConfig } = require('../config');
const {
  stats,
  idempotencyStore,
  chargedReferences,
  nextChargeId,
  resetBankStore,
} = require('../store/bank.store');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createCharge(req, res) {
  stats.requests++;

  const { reference, amount } = req.body || {};
  const idempotencyKey = req.header('Idempotency-Key');

  if (config.DELAY_MS > 0) {
    await sleep(config.DELAY_MS);
  }

  if (req.socket.destroyed) {
    return;
  }

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || !reference) {
    const errMsg = 'Số tiền hoặc mã tham chiếu (reference) không hợp lệ';
    return res.status(400).json({
      message: errMsg,
      error: errMsg,
      status: 'FAILED',
      reference: reference ?? null,
    });
  }

  if (amount > config.MAX_LIMIT) {
    const errMsg = `Số tiền vượt hạn mức giao dịch ${config.MAX_LIMIT.toLocaleString('vi-VN')}đ`;
    return res.status(402).json({
      message: errMsg,
      error: errMsg,
      status: 'FAILED',
      reference,
    });
  }

  if (config.FAIL_RATE > 0 && Math.random() < config.FAIL_RATE) {
    const errMsg = 'Lỗi hệ thống ngân hàng tạm thời (chưa trừ tiền)';
    return res.status(500).json({
      message: errMsg,
      error: errMsg,
      status: 'FAILED',
      reference,
    });
  }

  let chargeRecord;
  let isIdempotentReplay = false;

  if (idempotencyKey && idempotencyStore.has(idempotencyKey)) {
    chargeRecord = idempotencyStore.get(idempotencyKey);
    isIdempotentReplay = true;
  } else {
    const chargeId = nextChargeId();
    stats.charges++;

    if (chargedReferences.has(reference)) {
      stats.duplicates++;
      console.warn(`[Bank] CẢNH BÁO: Trừ tiền trùng (duplicate) cho reference=${reference}!`);
    } else {
      chargedReferences.add(reference);
    }

    chargeRecord = {
      message: 'Ngân hàng đã trừ tiền thành công',
      status: 'CHARGED',
      error: null,
      chargeId,
      reference,
      amount,
      createdAt: new Date().toISOString(),
    };

    if (idempotencyKey) {
      idempotencyStore.set(idempotencyKey, chargeRecord);
    }
  }

  if (config.DROP_RATE > 0 && Math.random() < config.DROP_RATE) {
    console.log(
      `[Bank] Đã trừ tiền (${chargeRecord.chargeId}, ref=${reference}) nhưng bị đứt kết nối trước khi trả lời!`
    );
    req.socket.destroy();
    return;
  }

  return res.status(201).json({
    ...chargeRecord,
    message: isIdempotentReplay
      ? 'Giao dịch đã được xử lý trước đó (Idempotency-Key), trả lại kết quả cũ và không trừ tiền thêm'
      : 'Ngân hàng đã trừ tiền thành công',
  });
}

function getStats(req, res) {
  res.json({
    message: 'Lấy thống kê hoạt động của Ngân hàng thành công',
    status: 'OK',
    error: null,
    ...stats,
  });
}

function resetBank(req, res) {
  if (req.body && typeof req.body === 'object') {
    updateConfig(req.body);
  }
  resetBankStore();
  res.json({
    message: 'Đã đặt lại trạng thái và cấu hình Ngân hàng thành công',
    status: 'OK',
    error: null,
    config: {
      DELAY_MS: config.DELAY_MS,
      FAIL_RATE: config.FAIL_RATE,
      DROP_RATE: config.DROP_RATE,
    },
    stats,
  });
}

function shutdownBank(req, res) {
  res.json({ message: 'Shutting down old Bank instance' });
  setTimeout(() => process.exit(0), 50);
}

module.exports = {
  createCharge,
  getStats,
  resetBank,
  shutdownBank,
};
