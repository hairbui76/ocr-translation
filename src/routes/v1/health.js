// src/routes/health.js

const express = require("#configs/express");
const router = express.Router();

const status = require("http-status");
const { redis } = require("#configs");
const ApiError = require("#utils/ApiError");

router.get("/", async (req, res) => {
	try {
		await checkRedisConnection();
		res.ok("Healthy", null);
	} catch (error) {
		throw new ApiError(status.INTERNAL_SERVER_ERROR, error.message);
	}
});

async function checkRedisConnection() {
	await redis.connect();
}

module.exports = router;
