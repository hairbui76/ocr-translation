// src/utils/MessageQueue/OCRQueue.js
const os = require("os");
const BaseQueue = require("./BaseQueue");
const BaseWorker = require("./BaseWorker");
const ocr = require("#utils/ocr");
const { simpleImageHash } = require("#utils/hash");
const pdf = require("#utils/pdf");
const translator = require("#utils/translator");

// console.log("Total CPUs: ", os.cpus().length);
const OCR_WORKER_NUMS = 1;

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
			this.completedListeners,
			"ocr-queue",
			async (job) => {
				console.log("OCR job", job.id, "at", new Date());
				// Process OCR job
				try {
					const ocrResult = await this.ocrPipeline(job);
					console.log("OCR job", job.id, "done at", new Date());
					return ocrResult;
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
		try {
			await job.updateProgress(20);
			const ocrResult = await ocr.image2text(imgBuffer);

			await job.updateProgress(40);

			return ocrResult;
		} catch (error) {
			console.error(`Error accessing cache:`, error);
			throw error;
		}
	}

	/**
	 * Translate text based on OCR result
	 * @param {string} ocrResult OCR result
	 * @param {import("bull").Job} job Job to process
	 * @returns
	 */
	async getTranslatedText(ocrResult, job, cached) {
		try {
			await job.updateProgress(60);
			const translatedText = await translator.translate(ocrResult);
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
	 * @returns {Promise<Buffer>} OCR result
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
			// Translation Filter
			const translatedText = await this.getTranslatedText(
				ocrResult,
				job,
				cached
			);

			await job.updateProgress(80);
			const pdfBuffer = await pdf.createPDF(translatedText);

			console.log("PDF generated for job:", job.id);
			await job.updateProgress(100);

			return pdfBuffer;
		} catch (error) {
			console.error(`Error in ocrPipeline for job ${job.id}:`, error);
			throw error;
		}
	}
}

module.exports = OCRQueue;
