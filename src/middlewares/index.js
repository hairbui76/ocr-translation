// src/middlewares/index.js

const errorHandler = require("./errorHandler");
const notFoundHandler = require("./notFoundHandler");

module.exports = {
	errorHandler,
	notFoundHandler,
};
