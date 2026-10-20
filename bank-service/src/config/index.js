const config = {
  PORT: Number(process.env.PORT || 4002),
  MAX_LIMIT: 20_000_000,
  DELAY_MS: Number(process.env.DELAY_MS || 0),
  FAIL_RATE: Number(process.env.FAIL_RATE || 0),
  DROP_RATE: Number(process.env.DROP_RATE || 0),
};

function updateConfig(overrides = {}) {
  if (overrides.DELAY_MS !== undefined) config.DELAY_MS = Number(overrides.DELAY_MS);
  if (overrides.FAIL_RATE !== undefined) config.FAIL_RATE = Number(overrides.FAIL_RATE);
  if (overrides.DROP_RATE !== undefined) config.DROP_RATE = Number(overrides.DROP_RATE);
}

module.exports = {
  config,
  updateConfig,
};
