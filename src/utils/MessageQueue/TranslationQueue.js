// src/utils/MessageQueue/TranslationQueue.js

const BaseQueue = require("./BaseQueue");
const BaseWorker = require("./BaseWorker");
const translator = require("#utils/translator");
const pdf = require("#utils/pdf");
const { simpleTranslatedTextHash } = require("#utils/hash");

const TRANSLATION_WORKER_NUMS = 1;

class TranslationQueue extends BaseQueue {
	/**
	 * Translation Queue constructor
	 * @param {string} name Queue name
	 * @param {import("ioredis").Redis} redisClient External redis client
	 */
	constructor(name, redisClient) {
		super(name, redisClient);

		for (let i = 0; i < TRANSLATION_WORKER_NUMS; i++) {
			this.workers.push(this.createTranslationWorker());
		}
	}

	createTranslationWorker() {
		return new BaseWorker(
			this.progressListeners,
			this.failedListeners,
			this.completedListeners,
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
	}

	/**
	 * Translate text based on OCR result
	 * @param {string} ocrResult OCR result
	 * @param {import("bull").Job} job Job to process
	 * @returns
	 */
	async getTranslatedText(ocrResult, job, cached) {
		const hash = simpleTranslatedTextHash(ocrResult);
		const cacheKey = `translate:${hash}`;

		try {
			await job.updateProgress(60);

			if (cached) {
				const cachedTranslatedText = await this.redisClient.get(cacheKey);

				if (cachedTranslatedText) {
					console.log("Found translated text in cache for job:", job.id);
					await job.updateProgress(70);
					return cachedTranslatedText;
				}
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
		const { ocrResult, cached } = job.data;
		try {
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
			console.error(`Error in translationPipeline for job ${job.id}:`, error);
			await job.updateProgress(100);
			// return Buffer.from("");
		}
	}
}

module.exports = TranslationQueue;
