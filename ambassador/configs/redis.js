// src/configs/redis.js

const Redis = require("ioredis");
const configs = require("./configs");

/**
 * Connect to Redis
 * @returns {Promise<import("ioredis").Redis>} Redis client
 */
function connect() {
	return new Promise((resolve, reject) => {
		/**
		 * @type {import("ioredis").Redis}
		 */
		const redisClient = new Redis(configs.REDIS.getUrl(), {
			maxRetriesPerRequest: null,
		});

		redisClient.on("connect", () => {
			console.log("Successfully connected to Redis!");
			resolve(redisClient);
		});

		redisClient.on("error", (error) => {
			console.error("Failed to connect to Redis:", error);
			reject(error);
		});
	});
}

module.exports = {
	connect,
};
