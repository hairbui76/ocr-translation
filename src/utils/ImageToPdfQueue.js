// const Queue = require("bull");
const ocr = require("./ocr");
const translator = require("./translator");
const pdf = require("./pdf");
const { REDIS } = require("#configs/configs");
const { simpleImageHash, simpleTranslatedTextHash } = require("./hash");
const { sleep } = require("./test");
const { Worker, Queue } = require("bullmq");

class OCRQueue extends Queue {
	/**
	 * OCR Queue constructor
	 * @param {string} name Queue name
	 * @param {import("ioredis").Redis} redisClient External redis client
	 * @param {TranslationQueue} translationQueue Translation queue
	 */
	constructor(name, redisClient, translationQueue) {
		super(name, { connection: redisClient });
		// Store Redis client
		this.redisClient = redisClient;
		this.progressListeners = new Map();

		// initialize workers
		for (let i = 0; i < 3; i++) {
			this.createOCRWorker(translationQueue);
		}

		// Error handling for the queue
		this.on("error", (error) => {
			console.error("Queue error:", error);
		});

		this.on("failed", (job, error) => {
			console.error("Job failed:", job.id, error);
			// Cleanup failed jobs
			this.removeAllListeners(`progress:${job.id}`);
			this.removeAllListeners(`failed:${job.id}`);
			this.removeAllListeners(`completed:${job.id}`);
		});
	}

	/**
	 * Adds a listener to the queue when progress is updated.
	 * @param {string} jobId
	 * @param {(progress) => {}} listener
	 * */
	addProgressListener(jobId, listener) {
		this.progressListeners.set(jobId, listener);
	}

	removeProgressListener(jobId) {
		this.progressListeners.delete(jobId);
	}

	createOCRWorker(translationQueue) {
		const ocrWorker = new Worker(
			"ocr-queue",
			async (job) => {
				console.log("OCR job", job.id, "at", new Date());
				// Process OCR job
				try {
					const ocrResult = await this.ocrPipeline(job);

					// Add translation job
					await translationQueue.add(
						job.data.fileName,
						{
							ocrResult,
							fileName: job.data.fileName,
						},
						{
							jobId: job.id + "_translation",
						}
					);
					console.log("OCR job", job.id, "done at", new Date());
				} catch (error) {
					console.error(`Job ${job.id} failed:`, error);
					throw error;
				}
			},
			{ connection: this.redisClient }
		);

		ocrWorker.on("progress", (job, progress) => {
			const listener = this.progressListeners.get(job.id);
			if (listener) {
				listener(progress);
			}
		});

		// Error handling for the queue
		ocrWorker.on("error", (error) => {
			console.error("Queue error:", error);
		});

		ocrWorker.on("failed", (job, error) => {
			console.error("Job failed:", job.id, error);
		});
	}

	/**
	 * Get OCR Result from image buffer
	 * @param {Buffer} imgBuffer Image buffer
	 * @param {import("bull").Job} job Job to process
	 * @returns {Promise<string>} OCR result
	 */
	async getOCRResult(imgBuffer, job) {
		const hash = simpleImageHash(imgBuffer);
		const cacheKey = `ocr:${hash}`;

		try {
			await job.updateProgress(10);

			const cachedOCRResult = await this.redisClient.get(cacheKey);

			if (cachedOCRResult) {
				console.log("Found OCR result in cache for job:", job.id);
				await job.updateProgress(40);
				return cachedOCRResult;
			}

			await job.updateProgress(20);
			const ocrResult = await ocr.image2text(imgBuffer);

			await this.redisClient.set(cacheKey, ocrResult);

			console.log("OCR result stored in cache for job:", job.id);
			await job.updateProgress(40);

			return ocrResult;
		} catch (error) {
			console.error(`Error accessing cache:`, error);
			throw error;
		}
	}

	/**
	 * Pipe and Filter pattern implementation for processing image
	 * @param {import("bull").Job} job Job to process
	 * @returns {Promise<string>} OCR result
	 */
	async ocrPipeline(job) {
		const { imgBuffer, fileName } = job.data;
		try {
			await job.updateProgress(0);
			// OCR Filter
			const ocrResult = await this.getOCRResult(
				Buffer.from(imgBuffer.data),
				job
			);

			await job.updateProgress(50);

			return ocrResult;
		} catch (error) {
			console.error(`Error in ocrPipeline for job ${job.id}:`, error);
			throw error;
		}
	}
}

class TranslationQueue extends Queue {
	/**
	 * Translation Queue constructor
	 * @param {string} name Queue name
	 * @param {import("ioredis").Redis} redisClient External redis client
	 */
	constructor(name, redisClient) {
		super(name, { connection: redisClient });
		// Store Redis client
		this.redisClient = redisClient;
		this.progressListeners = new Map();

		for (let i = 0; i < 2; i++) {
			this.createTranslationWorker();
		}

		// Error handling for the queue
		this.on("error", (error) => {
			console.error("Queue error:", error);
		});

		this.on("failed", (job, error) => {
			console.error("Job failed:", job.id, error);
			this.progressListeners.delete(job.id);
		});
	}

	/**
	 * Adds a listener to the queue when progress is updated.
	 * @param {string} jobId
	 * @param {(progress) => {}} listener
	 * */
	addProgressListener(jobId, listener) {
		this.progressListeners.set(jobId, listener);
	}

	removeProgressListener(jobId) {
		this.progressListeners.delete(jobId);
	}

	createTranslationWorker() {
		const translationWorker = new Worker(
			"translation-queue",
			async (job) => {
				console.log("Translation job", job.id, "at", new Date());
				// Process OCR job
				try {
					const res = await this.translationPipeline(job);
					console.log("Translation job", job.id, "done at", new Date());
					return res;
				} catch (error) {
					console.error(`Job ${job.id} failed:`, error);
					throw error;
				}
			},
			{ connection: this.redisClient }
		);

		translationWorker.on("progress", (job, progress) => {
			const listener = this.progressListeners.get(job.id);
			if (listener) {
				listener(progress);
			}
		});

		// Error handling for the queue
		translationWorker.on("error", (error) => {
			console.error("Queue error:", error);
		});

		translationWorker.on("failed", (job, error) => {
			console.error("Job failed:", job.id, error);
		});
	}

	/**
	 * Translate text based on OCR result
	 * @param {string} ocrResult OCR result
	 * @param {import("bull").Job} job Job to process
	 * @returns
	 */
	async getTranslatedText(ocrResult, job) {
		const hash = simpleTranslatedTextHash(ocrResult);
		const cacheKey = `translate:${hash}`;

		try {
			await job.updateProgress(60);

			const cachedTranslatedText = await this.redisClient.get(cacheKey);

			if (cachedTranslatedText) {
				console.log("Found translated text in cache for job:", job.id);
				await job.updateProgress(70);
				return cachedTranslatedText;
			}

			// await job.updateProgress(60);
			const translatedText = await translator.translate(ocrResult);

			await this.redisClient.set(cacheKey, translatedText);

			console.log("Translated text stored in cache for job:", job.id);
			await job.updateProgress(70);

			return translatedText;
		} catch (error) {
			console.error(`Error accessing cache:`, error);
			return translator.translate(ocrResult);
		}
	}

	/**
	 * Pipe and Filter pattern implementation for processing image
	 * @param {import("bull").Job} job Job to process
	 * @returns {Promise<Buffer>} PDF buffer
	 */
	async translationPipeline(job) {
		const { ocrResult } = job.data;
		try {
			await job.updateProgress(50);
			// Translation Filter
			const translatedText = await this.getTranslatedText(ocrResult, job);

			await job.updateProgress(80);
			const pdfBuffer = await pdf.createPDF(translatedText);

			await job.updateProgress(100);
			console.log("PDF generated for job:", job.id);

			return pdfBuffer;
		} catch (error) {
			console.error(`Error in translationPipeline for job ${job.id}:`, error);
			throw error;
		}
	}
}

module.exports = { OCRQueue, TranslationQueue };
