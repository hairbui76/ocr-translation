const { ApiError } = require("#utils");
const { NotFoundError, BadRequestError, InternalServerError } = ApiError;
const status = require("http-status");

/**
 * Process upload image
 * @param {import("express").Request} req Request object
 * @param {import("express").Response} res Response object
 */
const processUploadImage = async (req, res) => {
	if (!req.files || req.files.length === 0) {
		throw new BadRequestError("No image files uploaded.");
	}

	try {
		// const ocrQueue = req.app.get("imageToPdfQueue");
		/**
		 * @type {OCRQueue}
		 * */
		const ocrQueue = req.app.get("ocrQueue");
		/**
		 * @type {TranslationQueue}
		 * */
		const translationQueue = req.app.get("translationQueue");

		res.writeHead(status.OK, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		});

		let count = 0;
		const progressTracker = {};
		// Loop over each uploaded file
		for (const file of req.files) {
			count += 1;
			// Add job to OCR queue for each image
			const job = await ocrQueue.add(file.originalname, {
				imgBuffer: file.buffer,
				cached: req.body.cached === "true",
				fileName: file.originalname,
			});
			progressTracker[job.id] = 0;
			console.log("Job added to ocrQueue:", job.id);

			// Send initial job ID
			res.write(
				`data: ${JSON.stringify({ jobId: job.id, fileName: file.originalname })}\n\n`
			);

			// Set up event listeners for job progress and completion
			const progressListener = async (progress) => {
				progressTracker[job.id] = progress;
				const averageProgress =
					Object.values(progressTracker).reduce((acc, curr) => acc + curr, 0) /
					count;
				console.log("Average progress:", averageProgress);
				res.write(
					`data: ${JSON.stringify({
						state: "active",
						progress: averageProgress,
						fileName: file.originalname,
					})}\n\n`
				);
				if (averageProgress === 100) {
					cleanup();
					res.end();
				}
			};

			// if (count === req.files.length) {
			//   cleanup();
			//   res.end();
			// }

			const failedListener = async () => {
				res.write(`data: ${JSON.stringify({ state: "failed" })}\n\n`);
			};

			// add progress listener to the 2 queues
			ocrQueue.addProgressListener(job.id, progressListener);
			translationQueue.addProgressListener(
				job.id + "_translation",
				progressListener
			);
			// ocrQueue.on("progress", progressListener);
			// ocrQueue.on("failed", failedListener);

			const cleanup = () => {
				ocrQueue.removeProgressListener(job.id, progressListener);
				translationQueue.removeProgressListener(job.id, progressListener);
			};

			req.on("close", async () => {
				cleanup();
				// Optionally remove the job if client disconnects early
				try {
					const existingJob = await ocrQueue.getJob(job.id);
					if (existingJob) {
						await existingJob.remove();
					}
				} catch (error) {
					console.error(`Error cleaning up job ${job.id}:`, error);
				}
			});
		}
	} catch (error) {
		console.error("Error processing image:", error);
		throw new InternalServerError(error.message);
	}
};

const getJobResult = async (req, res) => {
	try {
		// const ocrQueue = req.app.get("imageToPdfQueue");
		const ocrQueue = req.app.get("translationQueue");
		const job = await ocrQueue.getJob(req.params.jobId + "_translation");
		if (!job) {
			console.log(`Job ${req.params.jobId} not found`);
			throw new NotFoundError("Job not found");
		}

		const state = await job.getState();
		console.log(`Job ${job.id} state:`, state);

		if (state === "completed") {
			const pdfBuffer = Buffer.from(job.returnvalue.data);
			if (!pdfBuffer || !(pdfBuffer instanceof Buffer)) {
				console.error(`Job ${job.id} completed but invalid PDF buffer found`);
				throw new InternalServerError("Invalid PDF generated");
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
			throw new InternalServerError(`Job ${job.id} failed: ${reason}`);
		} else {
			console.log(`Job ${job.id} not yet completed, state: ${state}`);
			return res.status(202).json({ state });
		}
	} catch (error) {
		console.error("Error retrieving job result:", error);
		throw new InternalServerError(error.message);
	}
};

module.exports = {
	processUploadImage,
	getJobResult,
};
