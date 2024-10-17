const { ApiError } = require("#utils");
const { NotFoundError, BadRequestError, InternalServerError } = ApiError;
const status = require("http-status");

const processUploadImage = async (req, res) => {
	if (!req.file) throw new BadRequestError("No file uploaded.");

	try {
		const processQueue = req.app.get("imageToPdfQueue");
		const job = await processQueue.add({ imgBuffer: req.file.buffer });
		console.log("Job added to processQueue:", job.id);
		res.ok("Job added to processQueue!", { jobId: job.id });
	} catch (error) {
		console.error("Error adding job to queue:", error);
		throw new InternalServerError(error.message);
	}
};

const getJobStatus = (req, res) => {
	const jobId = req.params.jobId;
	res.writeHead(status.OK, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
	});

	const processQueue = req.app.get("imageToPdfQueue");
	processQueue.sseClients.set(jobId, res);

	req.on("close", () => {
		processQueue.sseClients.delete(jobId);
	});
};

const getJobResult = async (req, res) => {
	try {
		const processQueue = req.app.get("imageToPdfQueue");
		const job = await processQueue.getJob(req.params.jobId);
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
	getJobStatus,
	getJobResult,
};
