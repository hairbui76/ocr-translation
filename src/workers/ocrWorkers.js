const { Worker } = require("bullmq");
const { OCRQueue } = require("#utils/ImageToPdfQueue");
const { REDIS } = require("#configs/configs");
const { simpleImageHash } = require("#utils/hash");
const ocr = require("#utils/ocr");

/**
 * Get OCR Result from image buffer
 * @param {Buffer} imgBuffer Image buffer
 * @param {import("bull").Job} job Job to process
 * @returns {Promise<string>} OCR result
 */
async function getOCRResult(imgBuffer, job) {
  const hash = simpleImageHash(imgBuffer);
  const cacheKey = `ocr:${hash}`;

  try {
    // await job.progress(10);

    const cachedOCRResult = await this.redisClient.get(cacheKey);

    if (cachedOCRResult) {
      console.log("Found OCR result in cache for job:", job.id);
      // await job.progress(40);
      return cachedOCRResult;
    }

    // await job.progress(20);
    const ocrResult = await ocr.image2text(imgBuffer);

    await this.redisClient.set(cacheKey, ocrResult);

    console.log("OCR result stored in cache for job:", job.id);
    // await job.progress(40);

    return ocrResult;
  } catch (error) {
    console.error(`Error accessing cache:`, error);
    throw error;
  }
}

/**
 * Pipe and Filter pattern implementation for processing image
 * @param {Job<any, any, string>} job Job to process
 * @returns {Promise<string>} OCR result
 */
async function ocrPipeline(job) {
  const { imgBuffer } = job.data;

  console.log("Starting ocrPipeline for job:", job.id);
  try {
    // await job.progress(0);
    // OCR Filter
    const ocrResult = await getOCRResult(Buffer.from(imgBuffer.data), job);
    console.log("OCR done");

    // await job.progress(100);

    return ocrResult;
  } catch (error) {
    console.error(`Error in ocrPipeline for job ${job.id}:`, error);
    throw error;
  }
}

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
        const ocrResult = ocrPipeline(job);
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
