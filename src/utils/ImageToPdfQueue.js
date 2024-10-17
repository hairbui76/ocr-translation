const Queue = require("bull");
const ocr = require("./ocr");
const translator = require("./translator");
const pdf = require("./pdf");
const { REDIS } = require("#configs/configs");

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

	updateJobProgress(jobId, message) {
		const client = this.sseClients.get(jobId);
		if (client) {
			client.write(`data: ${JSON.stringify({ message })}\n\n`);
		}
	}

	// Pipe and Filter pattern implementation
	async imagePipeline(job) {
		const { imgBuffer } = job.data;

		console.log("Starting imagePipeline for job:", job.id);
		try {
			// OCR Filter
			const ocrResult = await ocr.image2text(Buffer.from(imgBuffer.data));
			console.log("OCR done");
			this.updateJobProgress(job.id, "OCR completed");

			// Translation Filter
			const translatedText = await translator.translate(ocrResult);
			console.log("Translation done");
			this.updateJobProgress(job.id, "Translation completed");

			// PDF Generation Filter
			const pdfBuffer = await pdf.createPDF(translatedText);
			console.log("PDF generation done");
			this.updateJobProgress(job.id, "PDF generation completed");

			return pdfBuffer;
		} catch (error) {
			console.error(`Error in imagePipeline for job ${job.id}:`, error);
			throw error;
		}
	}
}

module.exports = ImageToPdfQueue;
