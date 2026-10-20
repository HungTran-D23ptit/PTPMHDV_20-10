const { config, setBankUrl } = require('../config');
const {
  getStudent,
  getAllStudents,
  nextPaymentId,
  savePayment,
  getAllPayments,
  resetFeeStore,
} = require('../store/fee.store');
const { chargeWithResilience } = require('../clients/bank.client');

function getStudentFees(req, res) {
  const student = getStudent(req.params.id);
  if (!student) {
    const errMsg = `Không tìm thấy sinh viên có mã ${req.params.id}`;
    return res.status(404).json({
      message: errMsg,
      error: errMsg,
      paymentId: null,
      status: 'FAILED',
    });
  }

  const debtFormatted = student.debt.toLocaleString('vi-VN');
  return res.status(200).json({
    message: `Lấy thông tin công nợ thành công: Sinh viên ${student.name} còn nợ ${debtFormatted}đ`,
    status: 'OK',
    error: null,
    studentId: student.id,
    name: student.name,
    debt: student.debt,
  });
}

async function createPayment(req, res) {
  const studentId = req.params.id;
  const student = getStudent(studentId);
  const { amount } = req.body || {};

  const paymentId = nextPaymentId();

  if (!student) {
    const errMsg = `Không tìm thấy sinh viên có mã ${studentId}`;
    return res.status(404).json({
      message: errMsg,
      error: errMsg,
      paymentId,
      status: 'FAILED',
      studentId,
      amount: amount ?? null,
    });
  }

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    const errMsg = 'Số tiền thanh toán phải là số dương hợp lệ';
    return res.status(400).json({
      message: errMsg,
      error: errMsg,
      paymentId,
      status: 'FAILED',
      studentId: student.id,
      amount: amount ?? null,
      remainingDebt: student.debt,
    });
  }

  if (amount > student.debt) {
    const errMsg = `Số tiền thanh toán (${amount.toLocaleString('vi-VN')}đ) vượt quá công nợ hiện tại (${student.debt.toLocaleString('vi-VN')}đ)`;
    return res.status(400).json({
      message: errMsg,
      error: errMsg,
      paymentId,
      status: 'FAILED',
      studentId: student.id,
      amount,
      remainingDebt: student.debt,
    });
  }

  const paymentRecord = {
    paymentId,
    studentId,
    amount,
    status: 'PROCESSING',
    error: null,
    message: 'Đang xử lý thanh toán...',
    createdAt: new Date().toISOString(),
  };
  savePayment(paymentRecord);

  const result = await chargeWithResilience(paymentId, amount);

  paymentRecord.status = result.status;
  paymentRecord.updatedAt = new Date().toISOString();

  if (result.status === 'PAID') {
    student.debt -= amount;
    paymentRecord.chargeId = result.chargeId;
    paymentRecord.error = null;
    paymentRecord.message = result.message;

    return res.status(201).json({
      message: result.message,
      error: null,
      paymentId,
      status: 'PAID',
      studentId,
      amount,
      remainingDebt: student.debt,
      chargeId: result.chargeId,
    });
  }

  paymentRecord.error = result.error;
  paymentRecord.message = result.message;
  return res.status(result.httpStatus).json({
    message: result.message,
    error: result.error,
    paymentId,
    status: result.status,
    studentId,
    amount,
    remainingDebt: student.debt,
  });
}

function listPayments(req, res) {
  const list = getAllPayments();
  res.json({
    message: `Lấy danh sách ${list.length} lệnh thanh toán thành công`,
    status: 'OK',
    error: null,
    payments: list,
  });
}

function resetFeeService(req, res) {
  if (req.body && req.body.BANK_URL) {
    setBankUrl(req.body.BANK_URL);
  }
  resetFeeStore();
  res.json({
    message: 'Đã đặt lại trạng thái Fee Service về mặc định thành công',
    status: 'OK',
    error: null,
    BANK_URL: config.BANK_URL,
    students: getAllStudents(),
  });
}

function shutdownFeeService(req, res) {
  res.json({ message: 'Shutting down old Fee Service instance' });
  setTimeout(() => process.exit(0), 50);
}

module.exports = {
  getStudentFees,
  createPayment,
  listPayments,
  resetFeeService,
  shutdownFeeService,
};
