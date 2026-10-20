const FEE_URL = process.env.FEE_URL || 'http://localhost:4001';
const BANK_URL = process.env.BANK_URL || 'http://localhost:4002';
const TOTAL_REQUESTS = 200;
const CONCURRENCY = 10;
const AMOUNT = 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runPool(total, concurrency, taskFn) {
  const results = [];
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < total) {
      const idx = currentIndex++;
      const res = await taskFn(idx);
      results[idx] = res;
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

async function main() {
  console.log('=== TÌNH HUỐNG 3: KIỂM THỬ DUY TRÌ KẾT NỐI (200 THANH TOÁN, 10 CÙNG LÚC) ===');

  await fetch(`${BANK_URL}/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ DELAY_MS: 0, FAIL_RATE: 0, DROP_RATE: 0 }),
  });
  await fetch(`${FEE_URL}/reset`, { method: 'POST' });

  const startTime = performance.now();

  const results = await runPool(TOTAL_REQUESTS, CONCURRENCY, async () => {
    const res = await fetch(`${FEE_URL}/students/1/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: AMOUNT }),
    });
    const body = await res.json();
    return { status: res.status, body };
  });

  const durationMs = Math.round(performance.now() - startTime);
  const successCount = results.filter((r) => r.status === 201 && r.body.status === 'PAID').length;

  const statsRes = await fetch(`${BANK_URL}/stats`);
  const stats = await statsRes.json();

  console.log(`\n[Kết quả đợt 1 - 200 yêu cầu song song (concurrency=${CONCURRENCY})]:`);
  console.log(`- Số thanh toán thành công : ${successCount}/${TOTAL_REQUESTS}`);
  console.log(`- Tổng thời gian thực hiện : ${durationMs} ms`);
  console.log(`- Thống kê Ngân hàng (/stats):`, stats);
  console.log(`  -> Số kết nối TCP đã mở  : ${stats.connections} (Yêu cầu <= 20)`);

  console.log(`\nĐang chờ nhàn rỗi 6 giây (để Ngân hàng đóng kết nối Keep-Alive sau 5 giây)...`);
  await sleep(6000);

  console.log(`Gửi tiếp 5 yêu cầu sau khi nhàn rỗi 6 giây...`);
  let postIdleSuccess = 0;
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${FEE_URL}/students/1/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: AMOUNT }),
    });
    const body = await res.json();
    if (res.status === 201 && body.status === 'PAID') {
      postIdleSuccess++;
    }
  }

  const statsAfterIdle = await (await fetch(`${BANK_URL}/stats`)).json();
  console.log(`- Thành công sau 6s nhàn rỗi: ${postIdleSuccess}/5`);
  console.log(`- Thống kê Ngân hàng sau đó :`, statsAfterIdle);
}

main().catch((err) => {
  console.error('Lỗi khi chạy script:', err);
  process.exit(1);
});
