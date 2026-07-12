const serverless = require('serverless-http');
const { createApp } = require('./server');

module.exports.handler = serverless(createApp());
