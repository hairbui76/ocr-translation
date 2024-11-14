const Queue = require("bull");
const ocr = require("./ocr");
const translator = require("./translator");
const pdf = require("./pdf");
const { REDIS } = require("#configs/configs");
const { simpleImageHash, simpleTranslatedTextHash } = require("./hash");
const { sleep } = require("./test");
const { Worker } = require("bullmq");

class OCRQueue extends Queue {
  /**
   * OCR Queue constructor
   * @param {string} name Queue name
   * @param {import("ioredis").Redis} redisClient External redis client
   * @param {TranslationQueue} translationQueue Translation queue
   */
  constructor(name, redisClient, translationQueue) {
    super(name, REDIS.getUrl());
    // Store Redis client
    this.redisClient = redisClient;
    this.progressListeners = new Map();

    // initialize workers
    for (let i = 0; i < 3; i++) {
      this.createOCRWorker(translationQueue);
    }

    // Error handling for the queue
    this.on("error", (error) => {
      console.error("Queue error:", error);
    });

    this.on("failed", (job, error) => {
      console.error("Job failed:", job.id, error);
      // Cleanup failed jobs
      this.removeAllListeners(`progress:${job.id}`);
      this.removeAllListeners(`failed:${job.id}`);
      this.removeAllListeners(`completed:${job.id}`);
    });
  }

  /**
   * Adds a listener to the queue when progress is updated.
   * @param {string} jobId
   * @param {(progress) => {}} listener
   * */
  addProgressListener(jobId, listener) {
    this.progressListeners.set(jobId, listener);
  }

  removeProgressListener(jobId) {
    this.progressListeners.delete(jobId);
  }

  createOCRWorker(translationQueue) {
    const ocrWorker = new Worker(
      "ocr-queue",
      async (job) => {
        console.log("Processing OCR job", job.id);
        // Process OCR job
        try {
          const ocrResult = await this.ocrPipeline(job);
          console.log("ocr result:", ocrResult);
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

    ocrWorker.on("progress", (job, progress) => {
      const listener = this.progressListeners.get(job.id);
      if (listener) {
        listener(progress);
      }
    });

    // Error handling for the queue
    ocrWorker.on("error", (error) => {
      console.error("Queue error:", error);
    });

    ocrWorker.on("failed", (job, error) => {
      console.error("Job failed:", job.id, error);
    });
  }

  /**
   * Get OCR Result from image buffer
   * @param {Buffer} imgBuffer Image buffer
   * @param {import("bull").Job} job Job to process
   * @returns {Promise<string>} OCR result
   */
  async getOCRResult(imgBuffer, job) {
    const hash = simpleImageHash(imgBuffer);
    const cacheKey = `ocr:${hash}`;

    try {
      await job.updateProgress(10);

      const cachedOCRResult = await this.redisClient.get(cacheKey);

      if (cachedOCRResult) {
        console.log("Found OCR result in cache for job:", job.id);
        await job.updateProgress(40);
        return cachedOCRResult;
      }

      await job.updateProgress(20);
      const ocrResult = await ocr.image2text(imgBuffer);

      await this.redisClient.set(cacheKey, ocrResult);

      console.log("OCR result stored in cache for job:", job.id);
      await job.updateProgress(40);

      return ocrResult;
    } catch (error) {
      console.error(`Error accessing cache:`, error);
      throw error;
    }
  }

  /**
   * Pipe and Filter pattern implementation for processing image
   * @param {import("bull").Job} job Job to process
   * @returns {Promise<string>} OCR result
   */
  async ocrPipeline(job) {
    const { imgBuffer } = job.data;

    console.log("Starting ocrPipeline for job:", job.id);
    try {
      await job.updateProgress(0);
      // OCR Filter
      const ocrResult = await this.getOCRResult(
        Buffer.from(imgBuffer.data),
        job,
      );
      console.log("OCR done");

      await job.updateProgress(50);

      return ocrResult;
    } catch (error) {
      console.error(`Error in ocrPipeline for job ${job.id}:`, error);
      throw error;
    }
  }
}

class TranslationQueue extends Queue {
  /**
   * Translation Queue constructor
   * @param {string} name Queue name
   * @param {import("ioredis").Redis} redisClient External redis client
   */
  constructor(name, redisClient) {
    super(name, REDIS.getUrl());
    // Store Redis client
    this.redisClient = redisClient;
    this.progressListeners = new Map();

    for (let i = 0; i < 2; i++) {
      this.createTranslationWorker();
    }

    // Error handling for the queue
    this.on("error", (error) => {
      console.error("Queue error:", error);
    });

    this.on("failed", (job, error) => {
      console.error("Job failed:", job.id, error);
    });
  }

  /**
   * Adds a listener to the queue when progress is updated.
   * @param {string} jobId
   * @param {(progress) => {}} listener
   * */
  addProgressListener(jobId, listener) {
    this.progressListeners.set(jobId, listener);
  }

  removeProgressListener(jobId) {
    this.progressListeners.delete(jobId);
  }

  createTranslationWorker() {
    const translationWorker = new Worker(
      "translation-queue",
      async (job) => {
        console.log("Translation job", job.id);
        // Process OCR job
        try {
          return await this.translationPipeline(job);
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

    translationWorker.on("progress", (job, progress) => {
      const listener = this.progressListeners.get(job.id);
      if (listener) {
        listener(progress);
      }
    });

    // Error handling for the queue
    translationWorker.on("error", (error) => {
      console.error("Queue error:", error);
    });

    translationWorker.on("failed", (job, error) => {
      console.error("Job failed:", job.id, error);
    });
  }

  /**
   * Translate text based on OCR result
   * @param {string} ocrResult OCR result
   * @param {import("bull").Job} job Job to process
   * @returns
   */
  async getTranslatedText(ocrResult, job) {
    const hash = simpleTranslatedTextHash(ocrResult);
    const cacheKey = `translate:${hash}`;

    try {
      await job.updateProgress(60);

      const cachedTranslatedText = await this.redisClient.get(cacheKey);

      if (cachedTranslatedText) {
        console.log("Found translated text in cache for job:", job.id);
        await job.updateProgress(70);
        return cachedTranslatedText;
      }

      // await job.updateProgress(60);
      const translatedText = await translator.translate(ocrResult);

      await this.redisClient.set(cacheKey, translatedText);

      console.log("Translated text stored in cache for job:", job.id);
      await job.updateProgress(70);

      return translatedText;
    } catch (error) {
      console.error(`Error accessing cache:`, error);
      return translator.translate(ocrResult);
    }
  }

  /**
   * Pipe and Filter pattern implementation for processing image
   * @param {import("bull").Job} job Job to process
   * @returns {Promise<Buffer>} PDF buffer
   */
  async translationPipeline(job) {
    const { ocrResult } = job.data;

    console.log("Starting translationPipeline for job:", job.id);
    try {
      await job.updateProgress(50);
      // Translation Filter
      const translatedText = await this.getTranslatedText(ocrResult, job);
      console.log("Translation:", translatedText);

      console.log("Translation done");

      await job.updateProgress(80);
      const pdfBuffer = await pdf.createPDF(translatedText);

      await job.updateProgress(100);
      console.log("PDF generated for job:", job.id);

      return pdfBuffer;
    } catch (error) {
      console.error(`Error in translationPipeline for job ${job.id}:`, error);
      throw error;
    }
  }
}

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

    // Track active jobs
    this.activeJobs = new Set();

    // Set higher max listeners if needed
    this.setMaxListeners(50);

    // Process jobs in the queue
    this.process(async (job) => {
      try {
        this.activeJobs.add(job.id);
        const pdfBuffer = await this.imagePipeline(job);
        return pdfBuffer;
      } catch (error) {
        console.error(`Job ${job.id} failed:`, error);
        throw error;
      } finally {
        // Cleanup after job completion
        this.activeJobs.delete(job.id);
        this.removeAllListeners(`progress:${job.id}`);
        this.removeAllListeners(`failed:${job.id}`);
        this.removeAllListeners(`completed:${job.id}`);
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

  /**
   * Get OCR Result from image buffer
   * @param {Buffer} imgBuffer Image buffer
   * @param {import("bull").Job} job Job to process
   * @returns {Promise<string>} OCR result
   */
  async getOCRResult(imgBuffer, job, cached = true) {
    const hash = simpleImageHash(imgBuffer);
    const cacheKey = `ocr:${hash}`;

    try {
      await job.progress(10);

      const cachedOCRResult = await this.redisClient.get(cacheKey);

      if (cached && cachedOCRResult) {
        console.log("Found OCR result in cache for job:", job.id);
        await job.progress(40);
        return cachedOCRResult;
      }

      await job.progress(20);
      const ocrResult = await ocr.image2text(imgBuffer);

      await this.redisClient.set(cacheKey, ocrResult);

      console.log("OCR result stored in cache for job:", job.id);
      await job.progress(40);

      return ocrResult;
    } catch (error) {
      console.error(`Error accessing cache:`, error);
      throw error;
    }
  }

  /**
   * Translate text based on OCR result
   * @param {string} ocrResult OCR result
   * @param {import("bull").Job} job Job to process
   * @returns {Promise<string>} Translated text
   */
  async getTranslatedText(ocrResult, job, cached = true) {
    const hash = simpleTranslatedTextHash(ocrResult);
    const cacheKey = `translate:${hash}`;

    try {
      await job.progress(50);

      const cachedTranslatedText = await this.redisClient.get(cacheKey);

      if (cached && cachedTranslatedText) {
        console.log("Found translated text in cache for job:", job.id);
        await job.progress(70);
        return cachedTranslatedText;
      }

      await job.progress(60);
      const translatedText = await translator.translate(ocrResult);

      await this.redisClient.set(cacheKey, translatedText);

      console.log("Translated text stored in cache for job:", job.id);
      await job.progress(70);

      return translatedText;
    } catch (error) {
      console.error(`Error accessing cache:`, error);
      return translator.translate(ocrResult);
    }
  }

  /**
   * Generate PDF based on translated text
   * @param {string} translatedText Translated text
   * @param {import("bull").Job} job Job to process
   * @return {Promise<Buffer>} PDF buffer
   */
  async getPdfResult(translatedText, job) {
    try {
      await job.progress(80);
      const pdfBuffer = await pdf.createPDF(translatedText);

      console.log("PDF generated for job:", job.id);
      await job.progress(90);
      return pdfBuffer;
    } catch (err) {
      console.err("Error generating PDF:", err);
      throw err;
    }
  }

  /**
   * Pipe and Filter pattern implementation for processing image
   * @param {import("bull").Job} job Job to process
   * @returns {Promise<Buffer>} PDF buffer
   */
  async imagePipeline(job) {
    const { imgBuffer, cached } = job.data;

    console.log("Starting imagePipeline for job:", job.id);
    try {
      await job.progress(0);
      // OCR Filter
      const ocrResult = await this.getOCRResult(
        Buffer.from(imgBuffer.data),
        job,
        cached,
      );
      console.log("OCR done");

      // Translation Filter
      const translatedText = await this.getTranslatedText(
        ocrResult,
        job,
        cached,
      );
      console.log("Translation done");

      // PDF Generation Filter
      const pdfBuffer = await this.getPdfResult(translatedText, job);
      console.log("PDF generation done");

      await job.progress(100);

      return pdfBuffer;
    } catch (error) {
      console.error(`Error in imagePipeline for job ${job.id}:`, error);
      throw error;
    }
  }
}

module.exports = { ImageToPdfQueue, OCRQueue, TranslationQueue };
