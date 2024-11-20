const autocannon = require("autocannon");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const http = require("http");
const EventEmitter = require("events");

// Create event emitter for custom events
const eventEmitter = new EventEmitter();

// Track metrics
let totalRequests = 0;
let completedRequests = 0;
let successfulRequests = 0;
let failedRequests = 0;
let totalProcessingTime = 0;
let isRunning = false;

// Store processing times for percentile calculations
const processingTimes = [];

// Create table row
const createRow = (stats) => {
	return `┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ Stat     │ 2.5%     │ 50%      │ 97.5%    │ 99%      │ Avg      │ Stdev    │ Max      │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Latency  │ ${stats.p2_5.padEnd(7)}  │ ${stats.p50.padEnd(
		7
	)}  │ ${stats.p97_5.padEnd(8)} │ ${stats.p99.padEnd(8)} │ ${stats.avg.padEnd(
		8
	)} │ ${stats.stddev.padEnd(8)} │ ${stats.max.padEnd(8)} │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘`;
};

// Calculate statistics for table
const calculateStats = (times) => {
	const sorted = times.slice().sort((a, b) => a - b);
	const sum = sorted.reduce((a, b) => a + b, 0);
	const avg = sum / sorted.length;
	const max = sorted[sorted.length - 1];

	// Calculate percentiles
	const p2_5 = sorted[Math.floor(sorted.length * 0.025)];
	const p50 = sorted[Math.floor(sorted.length * 0.5)];
	const p97_5 = sorted[Math.floor(sorted.length * 0.975)];
	const p99 = sorted[Math.floor(sorted.length * 0.99)];

	// Calculate standard deviation
	const variance =
		sorted.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / sorted.length;
	const stddev = Math.sqrt(variance);

	return {
		p2_5: `${p2_5} ms`,
		p50: `${p50} ms`,
		p97_5: `${p97_5} ms`,
		p99: `${p99} ms`,
		avg: `${Math.round(avg)} ms`,
		stddev: `${Math.round(stddev)} ms`,
		max: `${max} ms`,
	};
};

// Print final results
const printResults = () => {
	console.log("\n=== Complete Flow Benchmark Results ===");

	// Print latency table
	console.log("\nComplete Flow Latency Statistics (including PDF generation):");
	console.log(createRow(calculateStats(processingTimes)));

	console.log("\nSummary:");
	console.log("Total Requests:", totalRequests);
	console.log("Successful Requests:", successfulRequests);
	console.log("Failed Requests:", failedRequests);
	console.log(
		"Success Rate:",
		`${((successfulRequests / totalRequests) * 100).toFixed(2)}%`
	);

	console.log("\nProcessing Time Statistics:");
	console.log("  Min:", Math.min(...processingTimes), "ms");
	console.log("  Max:", Math.max(...processingTimes), "ms");
	console.log(
		"  Avg:",
		Math.round(totalProcessingTime / successfulRequests),
		"ms"
	);

	// Exit process after printing results
	process.exit(0);
};

// Function to check PDF signature and header
const checkPdfBytes = (data) => {
	// Convert data to Buffer if it's not already
	const buffer = Buffer.from(data);

	// Get first 8 bytes which should contain %PDF-1.x
	const header = buffer.slice(0, 8).toString("utf8");

	// Get first 16 bytes for more detailed inspection
	const firstBytes = buffer.slice(0, 16).toString("hex");

	return {
		header,
		firstBytes,
		isValidPdf: header.startsWith("%PDF-1."),
		bufferLength: buffer.length,
	};
};

// Poll for job result
const pollResult = async (jobId, baseUrl, maxAttempts = 30) => {
	for (let i = 0; i < maxAttempts; i++) {
		try {
			const response = await makeRequest(
				`${baseUrl}/api/v1/pdf/result/${jobId}`,
				{
					responseType: "buffer", // To handle binary data
				}
			);

			if (response.headers["content-type"] === "application/pdf") {
				// Check PDF bytes
				const pdfCheck = checkPdfBytes(response.data);
				console.log(`\nPDF Check for job ${jobId}:`);
				console.log("Header:", pdfCheck.header);
				console.log("First bytes:", pdfCheck.firstBytes);
				console.log("Is valid PDF:", pdfCheck.isValidPdf);
				console.log("Buffer length:", pdfCheck.bufferLength, "bytes");
				return true;
			}

			const result = JSON.parse(response.data);
			if (result.state === "completed") {
				return true;
			}
		} catch (e) {
			// Ignore parsing errors and continue polling
		}

		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	throw new Error("Max polling attempts reached");
};

// Make HTTP request that returns a Promise
const makeRequest = (url, options = {}) => {
	return new Promise((resolve, reject) => {
		const req = http.request(url, options, (res) => {
			const chunks = [];
			res.on("data", (chunk) => chunks.push(chunk));
			res.on("end", () => {
				const data = Buffer.concat(chunks);
				resolve({
					statusCode: res.statusCode,
					headers: res.headers,
					data: options.responseType === "buffer" ? data : data.toString(),
				});
			});
		});
		req.on("error", reject);
		if (options.body) req.write(options.body);
		req.end();
	});
};

// Disable console.log temporarily to suppress autocannon output
const originalLog = console.log;
console.log = (...args) => {
	if (args[0] && typeof args[0] === "string" && args[0].includes("Request")) {
		originalLog(...args);
	}
};

const instance = autocannon({
	url: "http://localhost:3000",
	connections: 10,
	amount: 10,
	requests: [
		{
			method: "POST",
			path: "/api/v1/pdf/upload",
			setupRequest: (request) => {
				const form = new FormData();
				const imageBuffer = fs.readFileSync(
					path.join(__dirname, "../sample/data/sample.png")
				);
				form.append("image", imageBuffer, {
					filename: "test.png",
					contentType: "image/png",
				});
				form.append("cached", "false");

				return {
					...request,
					headers: form.getHeaders(),
					body: form.getBuffer(),
				};
			},
			onResponse: async (status, body, context) => {
				originalLog("LMAO");
				totalRequests++;
				const startTime = Date.now();

				try {
					const lines = body.toString().split("\n\n");
					let jobId;

					for (const line of lines) {
						if (line.startsWith("data: ")) {
							try {
								const eventData = JSON.parse(line.slice(6));
								if (eventData.jobId) {
									jobId = eventData.jobId;
									break;
								}
							} catch (e) {
								// Continue if JSON parse fails
							}
						}
					}

					if (!jobId) {
						throw new Error("No jobId found in response");
					}

					const res = await fetch(
						"http://localhost:3000/api/v1/pdf/result/" + jobId
					);
					const pdfBlob = await res.blob();
					console.log(pdfBlob);

					const processingTime = Date.now() - startTime;
					processingTimes.push(processingTime);
					totalProcessingTime += processingTime;
					successfulRequests++;
					completedRequests++;

					console.log(
						`Request ${completedRequests}/${totalRequests} completed in ${processingTime}ms`
					);

					if (completedRequests === totalRequests) {
						console.log = originalLog;
						printResults();
						process.exit(0);
					}
				} catch (error) {
					console.error("Error processing request:", error);
					failedRequests++;
					completedRequests++;

					if (completedRequests === totalRequests) {
						console.log = originalLog;
						printResults();
						process.exit(0);
					}
				}
			},
		},
	],
	timeout: 60,
});

// Print initial message
originalLog("One Queue No Cache Benchmark");
originalLog(
	`Running ${instance.opts.amount} requests test @ ${instance.opts.url}`
);
originalLog(`${instance.opts.connections} connections\n`);
