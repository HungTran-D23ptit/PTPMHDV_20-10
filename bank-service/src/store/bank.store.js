const stats = {
  connections: 0,
  requests: 0,
  charges: 0,
  duplicates: 0,
};

let chargeCounter = 0;
const idempotencyStore = new Map();
const chargedReferences = new Set();

function nextChargeId() {
  chargeCounter++;
  return `CH${chargeCounter}`;
}

function resetBankStore() {
  stats.connections = 0;
  stats.requests = 0;
  stats.charges = 0;
  stats.duplicates = 0;
  chargeCounter = 0;
  idempotencyStore.clear();
  chargedReferences.clear();
}

module.exports = {
  stats,
  idempotencyStore,
  chargedReferences,
  nextChargeId,
  resetBankStore,
};
