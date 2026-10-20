const express = require('express');
const http = require('http');

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 4001);
let BANK_URL = process.env.BANK_URL || 'http://localhost:4002';

const initialStudents = () => ({
  '1': { id: '1', name: 'Nguyễn Văn A', debt: 50_000_000 },
  '2': { id: '2', name: 'Trần Thị B', debt: 0 },
  '3': { id: '3', name: 'Lê Văn C', debt: 3_200_000 },
});

let students = initialStudents();
let paymentCounter = 0;

function callBankNaive(bankUrlStr, payload) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL('/charges', bankUrlStr);
    const bodyData = JSON.stringify(payload);

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname,
      method: 'POST',
      agent: false,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyData),
        Connection: 'close',
      },
    };

    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let body = {};
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch (_) {}
        resolve({ statusCode: res.statusCode, body });
      });
    });

    req.on('error', (err) => reject(err));
    req.write(bodyData);
    req.end();
  });
}

app.get('/students/:id/fees', (req, res) => {
  const student = students[req.params.id];
  if (!student) {
    return res.status(404).json({
      message: `Không tìm thấy sinh viên có mã ${req.params.id}`,
      error: `Không tìm thấy sinh viên có mã ${req.params.id}`,
      paymentId: null,
      status: 'FAILED',
    });
  }
  res.json({
    message: 'Lấy thông tin công nợ sinh viên thành công',
    studentId: student.id,
    name: student.name,
    debt: student.debt,
    status: 'OK',
    error: null,
  });
});

app.post('/students/:id/payments', async (req, res) => {
  const student = students[req.params.id];
  const { amount } = req.body || {};

  paymentCounter++;
  const paymentId = `P${paymentCounter}`;

  if (!student) {
    return res.status(404).json({
      message: `Không tìm thấy sinh viên có mã ${req.params.id}`,
      error: `Không tìm thấy sinh viên có mã ${req.params.id}`,
      paymentId,
      status: 'FAILED',
    });
  }

  if (!amount || amount <= 0 || amount > student.debt) {
    return res.status(400).json({
      message: 'Số tiền không hợp lệ hoặc vượt quá công nợ',
      error: 'Số tiền không hợp lệ hoặc vượt quá công nợ',
      paymentId,
      status: 'FAILED',
      remainingDebt: student.debt,
    });
  }

  const naiveRetry = process.env.NAIVE_RETRY === 'true';
  const maxAttempts = naiveRetry ? 3 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await callBankNaive(BANK_URL, { reference: paymentId, amount });
      if (resp.statusCode === 201) {
        student.debt -= amount;
        return res.status(201).json({
          message: 'Thanh toán học phí thành công',
          error: null,
          paymentId,
          status: 'PAID',
          studentId: student.id,
          amount,
          remainingDebt: student.debt,
          chargeId: resp.body.chargeId,
        });
      }
      if (attempt === maxAttempts) {
        const msg = resp.body.error || 'Lỗi từ ngân hàng';
        return res.status(500).json({
          message: msg,
          error: msg,
          paymentId,
          status: 'FAILED',
          studentId: student.id,
          amount,
          remainingDebt: student.debt,
        });
      }
    } catch (err) {
      if (attempt === maxAttempts) {
        return res.status(500).json({
          message: err.message,
          error: err.message,
          paymentId,
          status: 'FAILED',
          studentId: student.id,
          amount,
          remainingDebt: student.debt,
        });
      }
    }
  }
});

app.post('/reset', (req, res) => {
  if (req.body && req.body.BANK_URL) BANK_URL = req.body.BANK_URL;
  students = initialStudents();
  paymentCounter = 0;
  res.json({ message: 'Reset naive fee service', status: 'OK', error: null });
});

app.listen(PORT, () => {
  console.log(`[Naive Fee Service] đang chạy tại http://localhost:${PORT}`);
});
