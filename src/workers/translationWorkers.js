const { Worker } = require("bullmq");
const { TranslationQueue } = require("#utils/ImageToPdfQueue");
const { REDIS } = require("#configs/configs");
const pdf = require("#utils/pdf");
const { simpleTranslatedTextHash } = require("#utils/hash");
const translator = require("#utils/translator");

/**
 * Translate text based on OCR result
 * @param {string} ocrResult OCR result
 * @param {import("bull").Job} job Job to process
 * @returns
 */
async function getTranslatedText(ocrResult, job) {
  const hash = simpleTranslatedTextHash(ocrResult);
  const cacheKey = `translate:${hash}`;

  try {
    // await job.progress(50);

    const cachedTranslatedText = await this.redisClient.get(cacheKey);

    if (cachedTranslatedText) {
      console.log("Found translated text in cache for job:", job.id);
      // await job.progress(70);
      return cachedTranslatedText;
    }

    // await job.progress(60);
    const translatedText = await translator.translate(ocrResult);

    await this.redisClient.set(cacheKey, translatedText);

    console.log("Translated text stored in cache for job:", job.id);
    // await job.progress(70);

    return translatedText;
  } catch (error) {
    console.error(`Error accessing cache:`, error);
    return translator.translate(ocrResult);
  }
}

/**
 * Pipe and Filter pattern implementation for processing image
 * @param {import("bull").Job} job Job to process
 * @returns
 */
async function translationPipeline(job) {
  const { ocrResult } = job.data;

  console.log("Starting translationPipeline for job:", job.id);
  try {
    await job.progress(0);
    // Translation Filter
    const translatedText = await getTranslatedText(ocrResult, job);

    console.log("Translation done");

    await job.progress(80);
    const pdfBuffer = await pdf.createPDF(translatedText);

    await job.progress(100);
    console.log("PDF generated for job:", job.id);

    return pdfBuffer;
  } catch (error) {
    console.error(`Error in translationPipeline for job ${job.id}:`, error);
    throw error;
  }
}

function createTranslationWorker() {
  const translationWorker = new Worker(
    "translation-queue",
    async (job) => {
      console.log("Translation job", job.id);
      // Process OCR job
      try {
        return await translationPipeline(job);
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
  });
}

function initTranslationWorkers() {
  for (let i = 0; i < 2; i++) {
    createTranslationWorker();
  }
}

module.exports = {
  initTranslationWorkers,
};
