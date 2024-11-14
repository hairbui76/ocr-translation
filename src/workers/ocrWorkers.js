const { Worker } = require("bullmq");
const { OCRQueue } = require("#utils/ImageToPdfQueue");
const { REDIS } = require("#configs/configs");

/**
 * Initialize OCR workers.
 * @param {import("bull").Queue} translationQueue
 * */
function createOCRWorker(translationQueue) {
  const ocrWorker = new Worker(
    "ocr-queue",
    async (job) => {
      console.log("Processing OCR job", job.id);
      // Process OCR job
      try {
        const ocrResult = await OCRQueue.ocrPipeline(job);
        // Add translation job
        await translationQueue.add(
          {
            ocrResult,
          },
          {
            jobId: job.id,
          },
        );
      } catch (error) {
        console.error(`Job ${job.id} failed:`, error);
        throw error;
      }
    },
    {
      connection: {
        host: REDIS.HOST,
        port: REDIS.PORT,
      },
    },
  );

  // Error handling for the queue
  ocrWorker.on("error", (error) => {
    console.error("Queue error:", error);
  });

  ocrWorker.on("failed", (job, error) => {
    console.error("Job failed:", job.id, error);
    // Cleanup failed jobs
    this.activeJobs.delete(job.id);
    this.removeAllListeners(`progress:${job.id}`);
    this.removeAllListeners(`failed:${job.id}`);
    this.removeAllListeners(`completed:${job.id}`);
  });
}

/**
 * Initialize OCR workers.
 * @param {TranslationQueue} translationQueue
 * */
function initOCRWorkers(translationQueue) {
  for (let i = 0; i < 3; i++) {
    createOCRWorker();
  }
}

module.exports = {
  initOCRWorkers,
};
