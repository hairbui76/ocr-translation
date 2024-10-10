const express = require("express");
const router = express.Router();
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage });
const Queue = require("bull");
const path = require("path");
const { ocr, pdf, translator } = require("#utils");
const { configs } = require("#configs");
const processQueue = new Queue("OCR-Translation-PDF", configs.REDIS.getUrl());

// Store SSE clients
const clients = new Map();

function updateJobProgress(jobId, message) {
	const client = clients.get(jobId);
	if (client) {
		client.write(`data: ${JSON.stringify({ message })}\n\n`);
	}
}

// Pipe and Filter pattern implementation
const imagePipeline = async (job) => {
	const { imgBuffer } = job.data;

	try {
		// OCR Filter
		const ocrResult = await ocr.image2text(Buffer.from(imgBuffer.data));
		updateJobProgress(job.id, "OCR completed");

		// Translation Filter
		const translatedText = await translator.translate(ocrResult);
		updateJobProgress(job.id, "Translation completed");

		// PDF Generation Filter
		const pdfBuffer = await pdf.createPDF(translatedText);
		updateJobProgress(job.id, "PDF generation completed");

		return pdfBuffer;
	} catch (error) {
		console.error(`Error in imagePipeline for job ${job.id}:`, error);
		throw error;
	}
};

router.post("/upload", upload.single("image"), async (req, res) => {
	if (!req.file) {
		return res.status(400).send("No file uploaded.");
	}

	try {
		const job = await processQueue.add({ imgBuffer: req.file.buffer });
		console.log("Job added to processQueue:", job.id);
		res.json({ jobId: job.id });
	} catch (error) {
		console.error("Error adding job to queue:", error);
		res.status(500).json({ error: "Failed to process image" });
	}
});

// Express route for SSE
router.get("/job-status/:jobId", (req, res) => {
	const jobId = req.params.jobId;
	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
	});

	clients.set(jobId, res);

	req.on("close", () => {
		clients.delete(jobId);
	});
});

// Express route for retrieving result
router.get("/result/:jobId", async (req, res) => {
	try {
		const job = await processQueue.getJob(req.params.jobId);
		if (!job) {
			console.log(`Job ${req.params.jobId} not found`);
			return res.status(404).json({ error: "Job not found" });
		}

		const state = await job.getState();
		console.log(`Job ${job.id} state:`, state);

		if (state === "completed") {
			const pdfBuffer = Buffer.from(job.returnvalue.data);
			if (!pdfBuffer || !(pdfBuffer instanceof Buffer)) {
				console.error(`Job ${job.id} completed but invalid PDF buffer found`);
				return res.status(500).json({ error: "Invalid PDF generated" });
			}
			console.log(
				`Sending PDF for job ${job.id}, buffer length: ${pdfBuffer.length}`
			);
			res.setHeader("Content-Type", "application/pdf");
			res.setHeader("Content-Disposition", "attachment; filename=result.pdf");
			return res.send(pdfBuffer);
		} else if (state === "failed") {
			const reason = job.failedReason;
			console.error(`Job ${job.id} failed:`, reason);
			return res.status(500).json({ error: "Job failed", reason });
		} else {
			console.log(`Job ${job.id} not yet completed, state: ${state}`);
			return res.status(202).json({ state });
		}
	} catch (error) {
		console.error("Error retrieving job result:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Process jobs in the queue
processQueue.process(async (job) => {
	try {
		const pdfBuffer = await imagePipeline(job);
		return pdfBuffer;
	} catch (error) {
		console.error(`Job ${job.id} failed:`, error);
		throw error;
	}
});

// Error handling for the queue
processQueue.on("error", (error) => {
	console.error("Queue error:", error);
});

processQueue.on("failed", (job, error) => {
	console.error("Job failed:", job.id, error);
});

module.exports = router;
