const express = require("express");
const router = express.Router();

const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage });

const { REDIS } = require("#configs/configs");
const ImageToPdfQueue = require("#utils/ImageToPdfQueue");
const processQueue = new ImageToPdfQueue("image-to-pdf-queue", REDIS.getUrl());

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

	processQueue.sseClients.set(jobId, res);

	req.on("close", () => {
		processQueue.sseClients.delete(jobId);
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

module.exports = router;