const { rateLimit } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");

/**
 * Create rate limit middleware
 * @param {import("ioredis").Redis} client Redis client
 * @returns {import("express-rate-limit").RateLimitRequestHandler}
 */
function create(client) {
	return rateLimit({
		windowMs: 15 * 60 * 1000, // 15 minutes
		limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
		standardHeaders: "draft-7", // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
		legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
		store: new RedisStore({
			sendCommand: (...args) => client.call(...args),
		}),
		handler: (req, res, next, options) =>
			res.status(options.statusCode).json({ message: options.message }),
	});
}

module.exports = { create };
