// src/utils/ApiError.js

const status = require("http-status");

class ApiError extends Error {
	/**
	 * Custom Error for API
	 * @param {number} code HTTP status code
	 * @param {string} message Custom error message
	 */
	constructor(code, message) {
		super();
		this.code = code;
		this.message = message;
	}
}

class InternalServerError extends ApiError {
	constructor(message) {
		super(status.INTERNAL_SERVER_ERROR, message);
	}
}

class NotFoundError extends ApiError {
	constructor(message) {
		super(status.NOT_FOUND, message);
	}
}

class BadRequestError extends ApiError {
	constructor(message) {
		super(status.BAD_REQUEST, message);
	}
}

module.exports = ApiError;

module.exports.InternalServerError = InternalServerError;

module.exports.NotFoundError = NotFoundError;

module.exports.BadRequestError = BadRequestError;
