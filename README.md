# OCR Translation

## Prerequisites

### Install Tesseract

Follow instructions in [tesseract documentation](https://tesseract-ocr.github.io/)

### Install nodejs

Follow instructions in [nodejs documentation](https://nodejs.org/en)

### Install npm dependencies

`npm install`

## Development

Run server in development mode

`npm run dev`

## Docker

Run server containerized in Docker

`docker compose up --build`

## Screenshots

![1](https://cdn.discordapp.com/attachments/1293837413436624918/1293837513177305118/FireShot_Capture_023_-_Image_to_PDF_Converter_-_localhost.png?ex=6708d395&is=67078215&hm=c94372513c31de7667315d6ebfcaef696d981e5c00a763295779d51a6affbeb2&)

## Design patterns used in the application

### Pipes and Filters pattern

> Checkout the file `src/utils/ImageToPdfQueue.js`

The function `imagePipeline` has three steps:

1. Get OCR Result scan from the image
2. Translate the text from OCR result
3. Generate PDF based on the text

```javascript
/**
	 * Pipe and Filter pattern implementation for processing image
	 * @param {import("bull").Job} job Job to process
	 * @returns {Promise<Buffer>} PDF buffer
	 */
	async imagePipeline(job) {
		const { imgBuffer } = job.data;

		console.log("Starting imagePipeline for job:", job.id);
		try {
			await job.progress(0);
			// OCR Filter
			const ocrResult = await this.getOCRResult(
				Buffer.from(imgBuffer.data),
				job
			);
			console.log("OCR done");

			// Translation Filter
			const translatedText = await this.getTranslatedText(ocrResult, job);
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
```

### Message Queue

> Checkout the file `src/utils/ImageToPdfQueue.js`

The ImageToPdfQueue class extends from the Queue class of `bull` npm library.

> The fastest, most reliable, Redis-based queue for Node.

```javascript
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
...
}
```

### Health endpoint monitoring

> Checkout the file `src/routes/v1/health.js`

```javascript
router.get("/", async (req, res) => {
	try {
		await checkDatabaseConnection();
		await checkRedisConnection();
		res.ok("Healthy", null);
	} catch (error) {
		throw new ApiError(status.INTERNAL_SERVER_ERROR, error.message);
	}
});
```

### Circuit breaker

> Checkout the file `src/utils/ocr.js` and `src/utils/translator.js`

I'm using CircuitBreaker from `opossum` npm library

```javascript
/**
 * OCR image to text
 * @param {string|Buffer} img Path or Buffer
 * @returns {Promise<string>} Result text
 */
async function _image2text(img) {
	return await tesseract.recognize(img, {
		lang: "eng",
	});
}

const breaker = new CircuitBreaker(_image2text);

const image2text = async (img) => {
	try {
		const res = await breaker.fire(img);
		return res;
	} catch (err) {
		throw new InternalServerError(err.message);
	}
};
```

### Cache Aside

> Checkout the file `src/utils/ImageToPdfQueue.js`

I'm using caching with redis in function `getOCRResult` and `getTranslatedText`. If the ocr or translated text has already been cached, return them immediately instead of performing the same operation again.

```javascript
async getOCRResult(imgBuffer, job) {
		const hash = simpleImageHash(imgBuffer);
		const cacheKey = `ocr:${hash}`;

		try {
			await job.progress(10);

			const cachedOCRResult = await this.redisClient.get(cacheKey);

			if (cachedOCRResult) {
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
```
