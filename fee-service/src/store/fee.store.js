const initialStudents = () => ({
  '1': { id: '1', name: 'Nguyễn Văn A', debt: 50_000_000 },
  '2': { id: '2', name: 'Trần Thị B', debt: 0 },
  '3': { id: '3', name: 'Lê Văn C', debt: 3_200_000 },
});

let students = initialStudents();
let paymentCounter = 0;
const payments = new Map();

function getStudent(id) {
  return students[id];
}

function getAllStudents() {
  return students;
}

function nextPaymentId() {
  paymentCounter++;
  return `P${paymentCounter}`;
}

function savePayment(record) {
  payments.set(record.paymentId, record);
}

function getAllPayments() {
  return Array.from(payments.values());
}

function resetFeeStore() {
  students = initialStudents();
  paymentCounter = 0;
  payments.clear();
}

module.exports = {
  getStudent,
  getAllStudents,
  nextPaymentId,
  savePayment,
  getAllPayments,
  resetFeeStore,
};
