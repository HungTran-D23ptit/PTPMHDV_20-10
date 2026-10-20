const express = require('express');
const {
  createCharge,
  getStats,
  resetBank,
  shutdownBank,
} = require('../controllers/bank.controller');

const router = express.Router();

router.post('/charges', createCharge);
router.get('/stats', getStats);
router.post('/reset', resetBank);
router.post('/shutdown', shutdownBank);

module.exports = router;
