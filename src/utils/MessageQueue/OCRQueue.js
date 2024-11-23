// src/utils/MessageQueue/OCRQueue.js

const BaseQueue = require("./BaseQueue");
const BaseWorker = require("./BaseWorker");
const ocr = require("#utils/ocr");
const { simpleImageHash } = require("#utils/hash");

const OCR_WORKER_NUMS = 3;

class OCRQueue extends BaseQueue {
	/**
	 * OCR Queue constructor
	 * @param {string} name Queue name
	 * @param {import("ioredis").Redis} redisClient External redis client
	 * @param {TranslationQueue} translationQueue Translation queue
	 */
	constructor(name, redisClient, translationQueue) {
		super(name, redisClient);
		this.translationQueue = translationQueue;

		// initialize workers
		for (let i = 0; i < OCR_WORKER_NUMS; i++) {
			this.workers.push(this.createOCRWorker(translationQueue));
		}
	}

	createOCRWorker() {
		return new BaseWorker(
			this.progressListeners,
			this.failedListeners,
			"ocr-queue",
			async (job) => {
				console.log("OCR job", job.id, "at", new Date());
				// Process OCR job
				try {
					const ocrResult = await this.ocrPipeline(job);

					// Add translation job
					await this.translationQueue.add(
						job.data.fileName,
						{
							ocrResult,
							fileName: job.data.fileName,
							cached: job.data.cached,
						},
						{ jobId: job.id + "_translation" }
					);
					console.log("OCR job", job.id, "done at", new Date());
				} catch (error) {
					console.error(`Job ${job.id} failed:`, error);
					throw error;
				}
			},
			{ connection: this.redisClient }
		);
	}

	/**
	 * Get OCR Result from image buffer
	 * @param {Buffer} imgBuffer Image buffer
	 * @param {import("bull").Job} job Job to process
	 * @returns {Promise<string>} OCR result
	 */
	async getOCRResult(imgBuffer, job, cached) {
		const hash = simpleImageHash(imgBuffer);
		const cacheKey = `ocr:${hash}`;

		try {
			await job.updateProgress(10);

			if (cached) {
				const cachedOCRResult = await this.redisClient.get(cacheKey);

				if (cachedOCRResult) {
					console.log("Found OCR result in cache for job:", job.id);
					await job.updateProgress(40);
					return cachedOCRResult;
				}
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
		const { imgBuffer, cached } = job.data;
		try {
			await job.updateProgress(0);
			// OCR Filter
			const ocrResult = await this.getOCRResult(
				Buffer.from(imgBuffer.data),
				job,
				cached
			);

			await job.updateProgress(50);

			return ocrResult;
		} catch (error) {
			console.error(`Error in ocrPipeline for job ${job.id}:`, error);
			throw error;
		}
	}
}

module.exports = OCRQueue;
