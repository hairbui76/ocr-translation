const Queue = require("bull");
const ocr = require("./ocr");
const translator = require("./translator");
const pdf = require("./pdf");
const { REDIS } = require("#configs/configs");
const { simpleImageHash, simpleTranslatedTextHash } = require("./hash");
const { sleep } = require("./test");

class ImageToPdfQueue extends Queue {
	/**
	 * Image to PDF Queue constructor
	 * @param {string} name Queue name
	 * @param {import("ioredis").Redis} redisClient External redis client
	 */
	constructor(name, redisClient) {
		super(name, REDIS.getUrl());
		// Store Redis client
		this.redisClient = redisClient;
		// Store SSE clients
		this.sseClients = new Map();

		// Process jobs in the queue
		this.process(async (job) => {
			try {
				const pdfBuffer = await this.imagePipeline(job);
				return pdfBuffer;
			} catch (error) {
				console.error(`Job ${job.id} failed:`, error);
				throw error;
			}
		});

		// Error handling for the queue
		this.on("error", (error) => {
			console.error("Queue error:", error);
		});

		this.on("failed", (job, error) => {
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
			await job.progress(10);

			const cachedOCRResult = await this.redisClient.get(cacheKey);

			if (cachedOCRResult) {
				console.log("Found OCR result in cache for job:", job.id);
				await job.progress(40);
				return cachedOCRResult;
			}

			await job.progress(20);
			const ocrResult = await ocr.image2text(imgBuffer);

			await this.redisClient.set(cacheKey, ocrResult);

			console.log("OCR result stored in cache for job:", job.id);
			await job.progress(40);

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
	 * @returns {Promise<string>} Translated text
	 */
	async getTranslatedText(ocrResult, job) {
		const hash = simpleTranslatedTextHash(ocrResult);
		const cacheKey = `translate:${hash}`;

		try {
			await job.progress(50);

			const cachedTranslatedText = await this.redisClient.get(cacheKey);

			if (cachedTranslatedText) {
				console.log("Found translated text in cache for job:", job.id);
				await job.progress(70);
				return cachedTranslatedText;
			}

			await job.progress(60);
			const translatedText = await translator.translate(ocrResult);

			await this.redisClient.set(cacheKey, translatedText);

			console.log("Translated text stored in cache for job:", job.id);
			await job.progress(70);

			return translatedText;
		} catch (error) {
			console.error(`Error accessing cache:`, error);
			return translator.translate(ocrResult);
		}
	}

	/**
	 * Generate PDF based on translated text
	 * @param {string} translatedText Translated text
	 * @param {import("bull").Job} job Job to process
	 * @return {Promise<Buffer>} PDF buffer
	 */
	async getPdfResult(translatedText, job) {
		try {
			await job.progress(80);
			const pdfBuffer = await pdf.createPDF(translatedText);

			console.log("PDF generated for job:", job.id);
			await job.progress(90);
			return pdfBuffer;
		} catch (err) {
			console.err("Error generating PDF:", err);
			throw err;
		}
	}

	/**
	 * Pipe and Filter pattern implementation for processing image
	 * @param {import("bull").Job} job Job to process
	 * @returns {Promise<Buffer>} PDF buffer
	 */
	async imagePipeline(job) {
		const { imgBuffer } = job.data;

		console.log("Starting imagePipeline for job:", job.id);
		try {
			await job.progress(0);
			// OCR Filter
			const ocrResult = await this.getOCRResult(
				Buffer.from(imgBuffer.data),
				job
			);
			console.log("OCR done");

			// Translation Filter
			const translatedText = await this.getTranslatedText(ocrResult, job);
			console.log("Translation done");

			// PDF Generation Filter
			const pdfBuffer = await this.getPdfResult(translatedText, job);
			console.log("PDF generation done");

			await job.progress(100);

			return pdfBuffer;
		} catch (error) {
			console.error(`Error in imagePipeline for job ${job.id}:`, error);
			throw error;
		}
	}
}

module.exports = ImageToPdfQueue;
