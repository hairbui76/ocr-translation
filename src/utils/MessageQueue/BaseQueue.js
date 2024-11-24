// src/utils/MessageQueue/BaseQueue.js

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
		this.completedListeners = new Map();
		this.workers = [];
	}

	addProgressListener(jobId, listener) {
		this.progressListeners.set(jobId, listener);
	}

	removeProgressListener(jobId) {
		this.progressListeners.delete(jobId);
	}

	addFailedListener(jobId, listener) {
		this.failedListeners.set(jobId, listener);
	}

	removeFailedListener(jobId) {
		this.failedListeners.delete(jobId);
	}

	addCompletedListener(jobId, listener) {
		this.completedListeners.set(jobId, listener);
	}

	removeCompletedListener(jobId) {
		this.completedListeners.delete(jobId);
	}
}

module.exports = BaseQueue;
