const status = require("http-status");

/**
 * Custom error handler express
 * @param {import("express").Request} req Express Request
 * @param {import("express").Response} res Express Response
 * @param {import("express").NextFunction} next Next function
 */
function notFoundHandler(req, res, next) {
	return res.status(status.NOT_FOUND).json({
		message: "Not Found",
	});
}

module.exports = notFoundHandler;
