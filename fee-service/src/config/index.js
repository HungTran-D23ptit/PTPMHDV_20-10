const config = {
  PORT: Number(process.env.PORT || 4001),
  BANK_URL: process.env.BANK_URL || 'http://localhost:4002',
  TOTAL_DEADLINE_MS: 4000,
  ATTEMPT_TIMEOUT_MS: 3500,
  MAX_ATTEMPTS: 3,
};

function setBankUrl(newUrl) {
  if (newUrl) {
    config.BANK_URL = newUrl;
  }
}

module.exports = {
  config,
  setBankUrl,
};
