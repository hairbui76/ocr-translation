// src/configs/index.js

const express = require("./express");
const configs = require("./configs");
const logger = require("./logger");
const redis = require("./redis");

module.exports = {
	express,
	configs,
	logger,
	redis,
};
