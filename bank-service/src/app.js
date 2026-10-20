const express = require('express');
const bankRoutes = require('./routes/bank.routes');

const app = express();
app.use(express.json());
app.use('/', bankRoutes);

module.exports = app;
