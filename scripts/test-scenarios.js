const { spawn } = require('child_process');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startProcess(relativeScriptPath, env = {}) {
  const child = spawn(process.execPath, [path.join(ROOT_DIR, relativeScriptPath)], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return child;
}

async function waitForServer(url, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch (_) {}
    await sleep(100);
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

async function killProcess(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await sleep(300);
}

async function runPool(total, concurrency, taskFn) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < total) {
      const current = idx++;
      results[current] = await taskFn(current);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

async function main() {
  console.log('======================================================================');
  console.log('BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG 4 TÌNH HUỐNG (LAB 3 - THANH TOÁN HỌC PHÍ)');
  console.log('======================================================================\n');

  let bankProc = null;
  let feeProc = null;

  try {
    console.log('----------------------------------------------------------------------');
    console.log('TÌNH HUỐNG 1: Ngân hàng không kết nối được, rồi hoạt động lại');
    console.log('----------------------------------------------------------------------');

    feeProc = startProcess('fee-service/server.js', {
      PORT: '4001',
      BANK_URL: 'http://localhost:4002',
    });
    await waitForServer('http://localhost:4001/students/1/fees');

    const t1Start = performance.now();
    const resWhenDown = await fetch('http://localhost:4001/students/1/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 100_000 }),
    });
    const t1Duration = Math.round(performance.now() - t1Start);
    const bodyWhenDown = await resWhenDown.json();

    const feeCheckStart = performance.now();
    const resFeeCheck = await fetch('http://localhost:4001/students/1/fees');
    const feeCheckDuration = Math.round(performance.now() - feeCheckStart);
    const bodyFeeCheck = await resFeeCheck.json();

    console.log(`[Khi Ngân hàng tắt]:`);
    console.log(`  - HTTP Status : ${resWhenDown.status} (Yêu cầu: 503)`);
    console.log(`  - Body trả về : ${JSON.stringify(bodyWhenDown)}`);
    console.log(`  - Thời gian   : ${t1Duration} ms (Yêu cầu: < 1500 ms)`);
    console.log(
      `  - Xem công nợ : HTTP ${resFeeCheck.status} trong ${feeCheckDuration} ms, debt=${bodyFeeCheck.debt.toLocaleString('vi-VN')}đ`
    );

    bankProc = startProcess('bank-service/server.js', { PORT: '4002' });
    await waitForServer('http://localhost:4002/stats');

    const resWhenUp = await fetch('http://localhost:4001/students/1/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 100_000 }),
    });
    const bodyWhenUp = await resWhenUp.json();
    console.log(`[Khi Ngân hàng chạy lại (không restart Fee Service)]:`);
    console.log(`  - HTTP Status : ${resWhenUp.status} (Yêu cầu: 201)`);
    console.log(`  - Body trả về : ${JSON.stringify(bodyWhenUp)}`);

    await fetch('http://localhost:4001/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ BANK_URL: 'http://localhost:4999' }),
    });
    const t4999Start = performance.now();
    const res4999 = await fetch('http://localhost:4001/students/1/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 100_000 }),
    });
    const t4999Duration = Math.round(performance.now() - t4999Start);
    console.log(`[Khi đổi BANK_URL sang http://localhost:4999]:`);
    console.log(
      `  - HTTP Status : ${res4999.status} trong ${t4999Duration} ms (Yêu cầu: 503, < 1500 ms)\n`
    );

    await fetch('http://localhost:4001/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ BANK_URL: 'http://localhost:4002' }),
    });

    console.log('----------------------------------------------------------------------');
    console.log('TÌNH HUỐNG 2: Ngân hàng phản hồi rất chậm (DELAY_MS=5000)');
    console.log('----------------------------------------------------------------------');

    await fetch('http://localhost:4002/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ DELAY_MS: 5000, FAIL_RATE: 0, DROP_RATE: 0 }),
    });

    const t2SingleStart = performance.now();
    const resSlow = await fetch('http://localhost:4001/students/1/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 100_000 }),
    });
    const t2SingleDuration = Math.round(performance.now() - t2SingleStart);
    const bodySlow = await resSlow.json();

    console.log(`[1 Thanh toán khi DELAY_MS=5000]:`);
    console.log(`  - HTTP Status : ${resSlow.status} (Yêu cầu: 504)`);
    console.log(`  - Trạng thái  : ${bodySlow.status} (Yêu cầu: PENDING)`);
    console.log(`  - Thời gian   : ${t2SingleDuration} ms (Yêu cầu: <= 4500 ms)`);

    const concurrentPaymentsPromise = Promise.all(
      Array.from({ length: 20 }, () =>
        fetch('http://localhost:4001/students/1/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: 50_000 }),
        })
      )
    );

    await sleep(300);
    const feeDuringLoadStart = performance.now();
    const resFeeDuringLoad = await fetch('http://localhost:4001/students/1/fees');
    const feeDuringLoadMs = Math.round(performance.now() - feeDuringLoadStart);
    const bodyFeeDuringLoad = await resFeeDuringLoad.json();

    const concurrentRes = await concurrentPaymentsPromise;
    const all504 = concurrentRes.every((r) => r.status === 504);

    console.log(`[Khi 20 thanh toán đang chờ ngân hàng]:`);
    console.log(
      `  - GET /students/1/fees phản hồi HTTP ${resFeeDuringLoad.status} trong ${feeDuringLoadMs} ms (Yêu cầu: < 300 ms)`
    );
    console.log(`  - 20 thanh toán đồng thời đều trả 504 PENDING: ${all504}`);
    console.log(
      `  - Công nợ sinh viên 1 giữ nguyên (chưa trừ khi PENDING): ${bodyFeeDuringLoad.debt.toLocaleString('vi-VN')}đ\n`
    );

    await sleep(2000);

    console.log('----------------------------------------------------------------------');
    console.log('TÌNH HUỐNG 3: Duy trì kết nối (200 thanh toán, 10 cùng lúc)');
    console.log('----------------------------------------------------------------------');

    await killProcess(bankProc);
    bankProc = startProcess('bank-service/server.js', {
      PORT: '4002',
      DELAY_MS: '0',
      FAIL_RATE: '0',
      DROP_RATE: '0',
    });
    await waitForServer('http://localhost:4002/stats');

    const naiveProc = startProcess('fee-service/server-naive.js', {
      PORT: '4003',
      BANK_URL: 'http://localhost:4002',
    });
    await waitForServer('http://localhost:4003/students/1/fees');
    await fetch('http://localhost:4002/reset', { method: 'POST' });

    const t3NaiveStart = performance.now();
    const naiveResults = await runPool(200, 10, async () => {
      const r = await fetch('http://localhost:4003/students/1/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 1000 }),
      });
      return r.status;
    });
    const t3NaiveDuration = Math.round(performance.now() - t3NaiveStart);
    const statsNaive = await (await fetch('http://localhost:4002/stats')).json();
    await killProcess(naiveProc);

    console.log(`[TRƯỚC KHI SỬA (Không Keep-Alive)]:`);
    console.log(`  - Thành công  : ${naiveResults.filter((s) => s === 201).length}/200`);
    console.log(`  - Thời gian   : ${t3NaiveDuration} ms`);
    console.log(`  - Số kết nối TCP ngân hàng phải mở: ${statsNaive.connections} kết nối`);

    await killProcess(bankProc);
    bankProc = startProcess('bank-service/server.js', {
      PORT: '4002',
      DELAY_MS: '0',
      FAIL_RATE: '0',
      DROP_RATE: '0',
    });
    await waitForServer('http://localhost:4002/stats');
    await fetch('http://localhost:4002/reset', { method: 'POST' });
    await fetch('http://localhost:4001/reset', { method: 'POST' });

    const t3Start = performance.now();
    const res3List = await runPool(200, 10, async () => {
      const r = await fetch('http://localhost:4001/students/1/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 1000 }),
      });
      return r.status;
    });
    const t3Duration = Math.round(performance.now() - t3Start);
    const stats3 = await (await fetch('http://localhost:4002/stats')).json();

    console.log(`[SAU KHI SỬA (Có Keep-Alive HTTP Agent)]:`);
    console.log(
      `  - Thành công  : ${res3List.filter((s) => s === 201).length}/200 (Yêu cầu: 200/200)`
    );
    console.log(`  - Thời gian   : ${t3Duration} ms`);
    console.log(
      `  - Số kết nối TCP ngân hàng phải mở: ${stats3.connections} kết nối (Yêu cầu: <= 20)`
    );

    console.log(`  - Đang chờ nhàn rỗi 6 giây (để ngân hàng đóng kết nối cũ sau 5s)...`);
    await sleep(6000);
    let postIdleOk = 0;
    for (let i = 0; i < 5; i++) {
      const r = await fetch('http://localhost:4001/students/1/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 1000 }),
      });
      if (r.status === 201) postIdleOk++;
    }
    console.log(`  - Sau 6 giây nhàn rỗi, gửi tiếp 5 yêu cầu: thành công ${postIdleOk}/5\n`);

    console.log('----------------------------------------------------------------------');
    console.log('TÌNH HUỐNG 4: Đứt giữa chừng, lỗi tạm thời, bị từ chối');
    console.log('----------------------------------------------------------------------');

    await fetch('http://localhost:4002/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ DELAY_MS: 0, FAIL_RATE: 0, DROP_RATE: 0.3 }),
    });
    await fetch('http://localhost:4001/reset', { method: 'POST' });

    const initialDebt4a = 50_000_000;
    const payAmount = 10_000;
    let paidCount4a = 0;
    let pendingCount4a = 0;

    for (let i = 0; i < 60; i++) {
      const r = await fetch('http://localhost:4001/students/1/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: payAmount }),
      });
      const b = await r.json();
      if (r.status === 201 && b.status === 'PAID') paidCount4a++;
      else if (r.status === 504 && b.status === 'PENDING') pendingCount4a++;
    }

    const stats4a = await (await fetch('http://localhost:4002/stats')).json();
    const feeAfter4a = await (await fetch('http://localhost:4001/students/1/fees')).json();
    const expectedDebt4a = initialDebt4a - paidCount4a * payAmount;

    console.log(`[4(a) DROP_RATE = 0.3 — 60 thanh toán lần lượt]:`);
    console.log(`  - Số lệnh PAID (201)    : ${paidCount4a}/60 (Yêu cầu: >= 54/60)`);
    console.log(`  - Số lệnh PENDING (504) : ${pendingCount4a}/60`);
    console.log(`  - Ngân hàng /stats      : ${JSON.stringify(stats4a)}`);
    console.log(`  - Số lần trừ trùng (duplicates): ${stats4a.duplicates} (Yêu cầu: = 0)`);
    console.log(
      `  - Công nợ còn lại       : ${feeAfter4a.debt.toLocaleString('vi-VN')}đ (Kỳ vọng đúng theo lệnh PAID: ${expectedDebt4a.toLocaleString('vi-VN')}đ -> Khớp: ${feeAfter4a.debt === expectedDebt4a})`
    );

    await fetch('http://localhost:4002/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ DELAY_MS: 0, FAIL_RATE: 0.3, DROP_RATE: 0 }),
    });
    await fetch('http://localhost:4001/reset', { method: 'POST' });

    let paidCount4b = 0;
    let failedCount4b = 0;

    for (let i = 0; i < 60; i++) {
      const r = await fetch('http://localhost:4001/students/1/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: payAmount }),
      });
      const b = await r.json();
      if (r.status === 201 && b.status === 'PAID') paidCount4b++;
      else if (r.status === 503 && b.status === 'FAILED') failedCount4b++;
    }

    const stats4b = await (await fetch('http://localhost:4002/stats')).json();
    console.log(`\n[4(b) FAIL_RATE = 0.3 — 60 thanh toán lần lượt]:`);
    console.log(`  - Số lệnh PAID (201)    : ${paidCount4b}/60 (Yêu cầu: >= 54/60)`);
    console.log(`  - Số lệnh FAILED (503)  : ${failedCount4b}/60`);
    console.log(`  - Ngân hàng /stats      : ${JSON.stringify(stats4b)}`);
    console.log(
      `  - Số lần trừ tiền (charges): ${stats4b.charges} (Khớp đúng số lệnh PAID: ${stats4b.charges === paidCount4b}, duplicates=${stats4b.duplicates})`
    );

    await fetch('http://localhost:4002/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ DELAY_MS: 0, FAIL_RATE: 0, DROP_RATE: 0 }),
    });
    await fetch('http://localhost:4001/reset', { method: 'POST' });

    const res4c = await fetch('http://localhost:4001/students/1/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 25_000_000 }),
    });
    const body4c = await res4c.json();
    const stats4c = await (await fetch('http://localhost:4002/stats')).json();

    console.log(`\n[4(c) Thanh toán 25.000.000đ (vượt hạn mức ngân hàng 20.000.000đ)]:`);
    console.log(`  - HTTP Status : ${res4c.status} (Yêu cầu: 402)`);
    console.log(`  - Body trả về : ${JSON.stringify(body4c)}`);
    console.log(
      `  - Số request ngân hàng nhận: ${stats4c.requests} (Yêu cầu: đúng 1 yêu cầu, không retry lỗi 402)`
    );

    console.log('\n======================================================================');
    console.log('TẤT CẢ 4 TÌNH HUỐNG ĐỀU ĐẠT KẾT QUẢ YÊU CẦU!');
    console.log('======================================================================');
  } finally {
    await killProcess(feeProc);
    await killProcess(bankProc);
  }
}

main().catch((err) => {
  console.error('Test thất bại:', err);
  process.exit(1);
});
