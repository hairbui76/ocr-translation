const status = require("http-status")

/**
 * Custom error handler express
 * @param {Error} err Error
 * @param {import("express").Request} req Express Request
 * @param {import("express").Response} res Express Response
 * @param {import("express").NextFunction} next Next function
 */
function errorHandler(err, req, res, next) {
	if (err instanceof ApiError) {
		return res.status(err.status).json({
			message: err.message
		});
	}
	return res.status(status.INTERNAL_SERVER_ERROR).json({
		message: "Internal Server Error"
	});
}

module.exports = errorHandler;