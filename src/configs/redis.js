const Redis = require("ioredis");
const configs = require("./configs");

function connect() {
	return new Promise((resolve, reject) => {
		/**
		 * @type {import("ioredis").Redis}
		 */
		const redisClient = new Redis(configs.REDIS.getUrl());

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
