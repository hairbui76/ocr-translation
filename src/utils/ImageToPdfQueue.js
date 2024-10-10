const Queue = require("bull");
const ocr = require("./ocr");
const translator = require("./translator");
const pdf = require("./pdf");

class ImageToPdfQueue extends Queue {
	constructor(name, redisUri) {
		super(name, redisUri);
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

		try {
			// OCR Filter
			const ocrResult = await ocr.image2text(Buffer.from(imgBuffer.data));
			this.updateJobProgress(job.id, "OCR completed");

			// Translation Filter
			const translatedText = await translator.translate(ocrResult);
			this.updateJobProgress(job.id, "Translation completed");

			// PDF Generation Filter
			const pdfBuffer = await pdf.createPDF(translatedText);
			this.updateJobProgress(job.id, "PDF generation completed");

			return pdfBuffer;
		} catch (error) {
			console.error(`Error in imagePipeline for job ${job.id}:`, error);
			throw error;
		}
	}
}

module.exports = ImageToPdfQueue;
