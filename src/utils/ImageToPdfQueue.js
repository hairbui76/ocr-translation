// OCRQueue.js
const Queue = require("bull");
const { REDIS } = require("#configs/configs");
const ocr = require("./ocr");
const { simpleImageHash, simpleTranslatedTextHash } = require("./hash");
const pdf = require("./pdf");
const translator = require("./translator");

console.log = (message) => {};

class OCRQueue extends Queue {
	constructor(name, redisClient) {
		super(name, REDIS.getUrl());
		this.redisClient = redisClient;

		this.process(async (job) => {
			try {
				console.log("OCR Job started:", job.id);
				const { imgBuffer, cached } = job.data;
				const result = await this.processOCR(
					Buffer.from(imgBuffer),
					job,
					cached
				);
				console.log("OCR Job completed:", job.id);
				return result;
			} catch (error) {
				console.error(`OCR Job ${job.id} failed:`, error);
				throw error;
			}
		});

		this.on("completed", (job, result) => {
			console.log(
				`OCR Job ${job.id} completed with result:`,
				result.substring(0, 50) + "..."
			);
		});

		this.on("failed", (job, error) => {
			console.error(`OCR Job ${job.id} failed:`, error);
		});
	}

	async processOCR(imgBuffer, job, cached = true) {
		const hash = simpleImageHash(imgBuffer);
		const cacheKey = `ocr:${hash}`;

		try {
			await job.progress(30);
			if (cached) {
				const cachedResult = await this.redisClient.get(cacheKey);
				if (cachedResult) {
					console.log("Found OCR result in cache for job:", job.id);
					await job.progress(100);
					return cachedResult;
				}
			}

			await job.progress(60);
			// Make sure we're working with a proper Buffer
			const buffer = Buffer.isBuffer(imgBuffer)
				? imgBuffer
				: Buffer.from(imgBuffer);
			const ocrResult = await ocr.image2text(buffer);
			await this.redisClient.set(cacheKey, ocrResult);

			await job.progress(100);
			return ocrResult;
		} catch (error) {
			console.error(`Error in OCR processing:`, error);
			throw error;
		}
	}
}

// TranslationQueue.js
class TranslationQueue extends Queue {
	constructor(name, redisClient) {
		super(name, REDIS.getUrl());
		this.redisClient = redisClient;

		this.process(async (job) => {
			try {
				console.log("Translation Job started:", job.id);
				const { text, cached } = job.data;
				const result = await this.processTranslation(text, job, cached);
				console.log("Translation Job completed:", job.id);
				return result;
			} catch (error) {
				console.error(`Translation Job ${job.id} failed:`, error);
				throw error;
			}
		});

		this.on("completed", (job, result) => {
			console.log(
				`Translation Job ${job.id} completed with result:`,
				result.substring(0, 50) + "..."
			);
		});

		this.on("failed", (job, error) => {
			console.error(`Translation Job ${job.id} failed:`, error);
		});
	}

	async processTranslation(text, job, cached = true) {
		const hash = simpleTranslatedTextHash(text);
		const cacheKey = `translate:${hash}`;

		try {
			await job.progress(30);
			if (cached) {
				const cachedResult = await this.redisClient.get(cacheKey);
				if (cachedResult) {
					console.log("Found translation in cache for job:", job.id);
					await job.progress(100);
					return cachedResult;
				}
			}

			await job.progress(60);
			const translatedText = await translator.translate(text);
			await this.redisClient.set(cacheKey, translatedText);

			await job.progress(100);
			return translatedText;
		} catch (error) {
			console.error(`Error in translation processing:`, error);
			throw error;
		}
	}
}

// PDFQueue.js
class PDFQueue extends Queue {
	constructor(name, redisClient) {
		super(name, REDIS.getUrl());
		this.redisClient = redisClient;

		this.process(async (job) => {
			try {
				console.log("PDF Job started:", job.id);
				const { text } = job.data;
				const result = await this.processPDF(text, job);
				console.log("PDF Job completed:", job.id);
				return result;
			} catch (error) {
				console.error(`PDF Job ${job.id} failed:`, error);
				throw error;
			}
		});

		this.on("completed", (job, result) => {
			console.log(`PDF Job ${job.id} completed`);
		});

		this.on("failed", (job, error) => {
			console.error(`PDF Job ${job.id} failed:`, error);
		});
	}

	async processPDF(text, job) {
		try {
			await job.progress(50);
			const pdfBuffer = await pdf.createPDF(text);

			await job.progress(100);
			return pdfBuffer;
		} catch (error) {
			console.error(`Error in PDF generation:`, error);
			throw error;
		}
	}
}

// ImageToPdfQueue.js
class ImageToPdfQueue extends Queue {
	constructor(name, redisClient) {
		super(name, REDIS.getUrl());
		this.redisClient = redisClient;
		this.activeJobs = new Set();

		// Init queues
		this.ocrQueue = new OCRQueue("ocrQueue", redisClient);
		this.translationQueue = new TranslationQueue(
			"translationQueue",
			redisClient
		);
		this.pdfQueue = new PDFQueue("pdfQueue", redisClient);

		this.setMaxListeners(50);

		this.process(async (job) => {
			try {
				console.log("Main Job started:", job.id);
				const { imgBuffer, cached } = job.data;
				this.activeJobs.add(job.id);

				// OCR step
				console.log("Adding OCR job...");
				const ocrJob = await this.ocrQueue.add({
					imgBuffer: imgBuffer.data ? imgBuffer.data : imgBuffer,
					cached,
				});
				await job.progress(30);
				console.log("Waiting for OCR result...");
				const ocrResult = await ocrJob.finished();
				console.log("OCR completed:", ocrResult.substring(0, 50) + "...");

				// Translation step
				console.log("Adding Translation job...");
				const translationJob = await this.translationQueue.add({
					text: ocrResult,
					cached,
				});
				await job.progress(60);
				console.log("Waiting for Translation result...");
				const translatedText = await translationJob.finished();
				console.log(
					"Translation completed:",
					translatedText.substring(0, 50) + "..."
				);

				// PDF step
				console.log("Adding PDF job...");
				const pdfJob = await this.pdfQueue.add({ text: translatedText });
				await job.progress(90);
				console.log("Waiting for PDF result...");
				const pdfBuffer = await pdfJob.finished();
				console.log("PDF completed");

				await job.progress(100);
				return pdfBuffer;
			} catch (error) {
				console.error(`Main Job ${job.id} failed:`, error);
				throw error;
			} finally {
				this.activeJobs.delete(job.id);
				this.removeAllListeners(`progress:${job.id}`);
				this.removeAllListeners(`failed:${job.id}`);
				this.removeAllListeners(`completed:${job.id}`);
			}
		});

		this.on("error", (error) => {
			console.error("Queue error:", error);
		});

		this.on("failed", (job, error) => {
			console.error("Job failed:", job.id, error);
		});

		this.on("completed", (job, result) => {
			console.log(`Job ${job.id} completed successfully`);
		});
	}
}

module.exports = {
	ImageToPdfQueue,
	OCRQueue,
	TranslationQueue,
	PDFQueue,
};
