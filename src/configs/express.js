const express = require("express");
const catchAsync = require("#utils/catchAsync");
const status = require("http-status");

const originalRouter = express.Router;
express.Router = function () {
	const router = originalRouter.call(this);

	const methods = ["get", "post", "put", "patch", "delete", "all"];

	methods.forEach((method) => {
		const originalMethod = router[method];

		router[method] = function (path, ...handlers) {
			const newHandlers = handlers.map((handler) => catchAsync(handler));
			return originalMethod.call(this, path, ...newHandlers);
		};
	});

	return router;
};

/**
 * Response 200
 * @param {string} message Response message
 * @param {any} data Response data
 * @returns {import("express").Response}
 */
express.response.ok = function (message, data = null) {
	return this.status(status.OK).json({ message, data });
};

module.exports = express;
