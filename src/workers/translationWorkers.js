const { Worker } = require("bullmq");
const { TranslationQueue } = require("#utils/ImageToPdfQueue");
const { REDIS } = require("#configs/configs");

function createOCRWorker() {
  const translationWorker = new Worker(
    "translation-queue",
    async (job) => {
      console.log("Translation job", job.id);
      // Process OCR job
      try {
        return await TranslationQueue.translationPipeline(job);
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
  translationWorker.on("error", (error) => {
    console.error("Queue error:", error);
  });

  translationWorker.on("failed", (job, error) => {
    console.error("Job failed:", job.id, error);
    // Cleanup failed jobs
    this.activeJobs.delete(job.id);
    this.removeAllListeners(`progress:${job.id}`);
    this.removeAllListeners(`failed:${job.id}`);
    this.removeAllListeners(`completed:${job.id}`);
  });
}

function initTranslationWorkers() {
  for (let i = 0; i < 2; i++) {
    createOCRWorker();
  }
}

module.exports = {
  initTranslationWorkers,
};
