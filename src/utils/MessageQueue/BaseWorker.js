// src/utils/MessageQueue/BaseWorker.js

const { Worker } = require("bullmq");

class BaseWorker extends Worker {
	constructor(progressListeners, failedListeners, completedListeners, ...args) {
		super(...args);
		this.progressListeners = progressListeners;
		this.failedListeners = failedListeners;
		this.completedListeners = completedListeners;

		this.on("progress", (job, progress) => {
			const listener = this.progressListeners.get(job.id);
			if (listener) {
				listener(progress);
			}
		});

		this.on("error", (error) => {
			console.error("OCR Queue error:", error);
		});

		this.on("failed", (job, error) => {
			console.error("OCR Job failed:", job.id, error);
			const listener = this.failedListeners.get(job.id);
			if (listener) {
				listener(error);
			}
		});

		this.on("completed", (job) => {
			console.log("Job completed:", job.id);
			const listener = this.completedListeners.get(job.id);
			if (listener) {
				listener();
			}
		});
	}
}

module.exports = BaseWorker;
