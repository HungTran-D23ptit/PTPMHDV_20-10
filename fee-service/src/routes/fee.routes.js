const express = require('express');
const {
  getStudentFees,
  createPayment,
  listPayments,
  resetFeeService,
  shutdownFeeService,
} = require('../controllers/fee.controller');

const router = express.Router();

router.get('/students/:id/fees', getStudentFees);
router.post('/students/:id/payments', createPayment);
router.get('/payments', listPayments);
router.post('/reset', resetFeeService);
router.post('/shutdown', shutdownFeeService);

module.exports = router;
