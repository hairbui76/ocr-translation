// ambassador/server.js

const express = require("./configs/express");
const CircuitBreaker = require("opossum");
const multer = require("multer");
const FormData = require("form-data");
const axios = require("axios");
const { Readable } = require("stream");
const cors = require("cors");
const {
	validateSingleFile,
	validateMultipleFiles,
} = require("./middlewares/fileValidation");

class AmbassadorService {
	constructor() {
		this.app = express();
		this.app.use(express.json());
		this.app.use(
			express.urlencoded({
				extended: true,
			})
		);
		this.app.use(cors());

		// Configure multer for file uploads
		const storage = multer.memoryStorage();
		this.upload = multer({ storage });

		// Circuit breaker configuration
		this.breakers = new Map();

		this.setupRoutes();
	}

	setupCircuitBreakerEvents(breaker, serviceUrl) {
		const events = {
			success: "Request succeeded",
			timeout: "Request timed out",
			reject: "Request rejected (circuit open)",
			open: "Circuit breaker opened",
			close: "Circuit breaker closed",
			halfOpen: "Circuit breaker half-opened",
			fallback: "Fallback called",
			failure: "Request failed",
		};

		Object.entries(events).forEach(([event, message]) => {
			breaker.on(event, () => {
				console.log(`[${serviceUrl}] ${message}`);
			});
		});

		// Add error event with error details
		breaker.on("error", (error) => {
			console.error(`[${serviceUrl}] Error:`, error.message);
		});
	}

	/**
	 * Initialize circuit breaker for a specific service
	 */
	getBreaker(serviceUrl) {
		if (!this.breakers.has(serviceUrl)) {
			const breaker = new CircuitBreaker(
				async (config) => {
					try {
						// Important: Add streaming configuration for axios
						if (config.responseType === "stream") {
							config.responseType = "stream";
							config.headers["Accept"] = "text/event-stream";
						}

						return await axios({
							...config,
							// Don't parse the response when streaming
							transformResponse:
								config.responseType === "stream"
									? []
									: axios.default.transformResponse,
						});
					} catch (error) {
						if (error.response) {
							return error.response;
						} else if (error.request) {
							throw new Error("No response received from service");
						} else {
							throw error;
						}
					}
				},
				{
					timeout: 30000,
					errorThresholdPercentage: 50,
					resetTimeout: 30000,
				}
			);

			breaker.fallback(async () => ({
				status: 503,
				headers: { "content-type": "application/json" },
				data: { error: "Service temporarily unavailable" },
			}));

			this.setupCircuitBreakerEvents(breaker, serviceUrl);
			this.breakers.set(serviceUrl, breaker);
		}

		return this.breakers.get(serviceUrl);
	}

	async handleResponse(response, res) {
		if (!response) {
			console.error("No response received from service");
			return res.status(500).json({
				error: "Internal Server Error",
				message: "No response received from service",
			});
		}

		try {
			// Set status code
			res.status(response.status || 500);

			// Copy headers
			if (response.headers) {
				Object.entries(response.headers).forEach(([key, value]) => {
					try {
						if (key.toLowerCase() !== "transfer-encoding") {
							res.setHeader(key, value);
						}
					} catch (err) {
						console.warn(`Could not set header ${key}:`, err.message);
					}
				});
			}

			// Handle streaming response
			if (response.headers?.["content-type"]?.includes("text/event-stream")) {
				console.log("Handling SSE response");

				// Set SSE headers
				res.setHeader("Content-Type", "text/event-stream");
				res.setHeader("Cache-Control", "no-cache");
				res.setHeader("Connection", "keep-alive");

				res.write(response.data);
			}
			// Handle PDF or other binary responses
			else if (response.config?.responseType === "arraybuffer") {
				console.log("Handling PDF response");
				if (response.data) {
					res.send(Buffer.from(response.data));
				} else {
					res.end();
				}
			}
			// Handle regular JSON/text responses
			else {
				res.send(response.data || { message: "No data received" });
			}
		} catch (error) {
			console.error("Error handling response:", error);
			if (!res.headersSent) {
				res.status(500).json({
					error: "Error handling response",
					message: error.message,
				});
			} else {
				res.end();
			}
		}
	}

	getResponseType(path, headers) {
		// For SSE requests
		if (
			path.includes("/api/pdf/upload") ||
			path.includes("/api/pdf/upload/array")
		) {
			return "stream";
		}
		// For PDF downloads
		if (path.includes("/pdf/result")) {
			return "arraybuffer";
		}
		return "json";
	}

	get targetUrl() {
		if (process.env.TARGET_SERVICE_URL) return process.env.TARGET_SERVICE_URL;
		const HOSTNAME = process.env.HOST || "localhost";
		const TARGET_SERVICE_PORT = process.env.TARGET_SERVICE_PORT || 3000;
		if (
			HOSTNAME === "localhost" ||
			/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
				HOSTNAME
			)
		)
			return `http://${HOSTNAME}:${TARGET_SERVICE_PORT}`;
		return `https://${HOSTNAME}:${TARGET_SERVICE_PORT}`;
	}

	async forwardRequest(req, res) {
		const targetUrl = this.targetUrl;
		const breaker = this.getBreaker(targetUrl);

		try {
			console.log(
				`Forwarding ${req.method} request to: ${targetUrl}${req.path}`
			);

			// Check if request contains files
			if (req.files?.length > 0 || req.file) {
				const formData = new FormData();

				if (req.files?.length > 0) {
					req.files.forEach((file) => {
						const stream = new Readable();
						stream.push(file.buffer);
						stream.push(null);
						formData.append(file.fieldname, stream, {
							filename: file.originalname,
							contentType: file.mimetype,
						});
					});
				} else if (req.file) {
					const stream = new Readable();
					stream.push(req.file.buffer);
					stream.push(null);
					formData.append(req.file.fieldname, stream, {
						filename: req.file.originalname,
						contentType: req.file.mimetype,
					});
				}

				Object.keys(req.body || {}).forEach((key) => {
					formData.append(key, req.body[key]);
				});

				const config = {
					method: req.method,
					url: `${targetUrl}${req.path}`,
					headers: {
						...formData.getHeaders(),
						"X-Request-ID": req.headers["x-request-id"],
						...(this.getResponseType(req.path, req.headers) === "stream" && {
							Accept: "text/event-stream",
						}),
					},
					data: formData,
					maxContentLength: Infinity,
					maxBodyLength: Infinity,
					responseType: this.getResponseType(req.path, req.headers),
				};

				const response = await breaker.fire(config);
				await this.handleResponse(response, res);
			} else {
				const config = {
					method: req.method,
					url: `${targetUrl}${req.path}`,
					headers: {
						...req.headers,
						host: new URL(targetUrl).host,
						Accept: "text/event-stream",
					},
					data: req.method !== "GET" ? req.body : undefined,
					params: req.query,
					responseType: this.getResponseType(req.path, req.headers),
				};

				const response = await breaker.fire(config);
				await this.handleResponse(response, res);
			}
		} catch (error) {
			console.error("Error forwarding request:", error);
			res.status(500).json({
				error: "Internal Server Error",
				message: error.message,
				path: req.path,
			});
		}
	}

	setupRoutes() {
		// Health check endpoint
		this.app.get("/health", (req, res) => {
			res.json({ status: "healthy" });
		});

		// Handle single file uploads
		this.app.post(
			"/api/pdf/upload",
			this.upload.single("image"),
			validateSingleFile,
			(req, res) => this.forwardRequest(req, res)
		);

		// Handle multiple file uploads
		this.app.post(
			"/api/pdf/upload/array",
			validateMultipleFiles,
			this.upload.array("images"),
			(req, res) => this.forwardRequest(req, res)
		);

		// Handle all routes
		this.app.all("*", (req, res) => this.forwardRequest(req, res));
	}

	start(port = 3001, hostname = "localhost") {
		this.app.listen(port, hostname, () => {
			console.log(`Ambassador service listening on port ${port}`);
		});
	}
}

// Start the ambassador service
new AmbassadorService().start(process.env.PORT, process.env.HOST);
