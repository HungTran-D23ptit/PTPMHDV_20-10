const express = require('express');
const feeRoutes = require('./routes/fee.routes');

const app = express();
app.use(express.json());
app.use('/', feeRoutes);

module.exports = app;
