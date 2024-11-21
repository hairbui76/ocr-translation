// src/utils/MessageQueue/BaseQueue.js

const { logger } = require("#configs/logger");
const { Queue } = require("bullmq");

class BaseQueue extends Queue {
	/**
	 * Base Queue constructor
	 * @param {string} name Queue name
	 * @param {import("ioredis").Redis} redisClient External redis client
	 */
	constructor(name, redisClient) {
		super(name, { connection: redisClient });
		// Store Redis client
		this.redisClient = redisClient;
		this.progressListeners = new Map();
		this.failedListeners = new Map();
		this.workers = [];
	}

	addProgressListener(jobId, listener) {
		console.log("addProgressListener", jobId);
		this.progressListeners.set(jobId, listener);
	}

	removeProgressListener(jobId) {
		console.log("removeProgressListener", jobId);
		this.progressListeners.delete(jobId);
	}

	addFailedListener(jobId, listener) {
		console.log("addFailedListener", jobId);
		this.failedListeners.set(jobId, listener);
	}

	removeFailedListener(jobId) {
		console.log("removeFailedListener", jobId);
		this.failedListeners.delete(jobId);
	}

	lmao() {
		console.log("lmao");
	}
}

module.exports = BaseQueue;
