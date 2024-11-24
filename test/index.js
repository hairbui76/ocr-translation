const autocannon = require("autocannon");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const http = require("http");
const EventEmitter = require("events");
const { sleep } = require("#utils/test");

// Create event emitter for custom events
EventEmitter.defaultMaxListeners = 50;

// Track metrics
let totalRequests = 0;
let completedRequests = 0;
let successfulRequests = 0;
let failedRequests = 0;
let totalProcessingTime = 0;

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

async function fetchResult(jobId) {
	try {
		const response = await fetch(
			`http://localhost:3000/api/v1/pdf/result/${jobId}`
		);

		if (response.headers.get("Content-Type") !== "application/pdf") {
			const data = await response.json();
			if (data.state === "completed") {
				await sleep(100);
				return fetchResult(jobId);
			} else if (data.error) {
				console.error("Job failed:", data.error);
				return null;
			} else {
				await sleep(100);
				return fetchResult(jobId);
			}
		}

		return response;
	} catch (error) {
		console.error("Error fetching result:", error);
		loader.style.display = "none";
		uploadButton.disabled = false;
	}
}

const parseEventStreamData = (body) => {
	const events = [];
	const lines = body.toString().split("\n\n");

	for (const line of lines) {
		if (line.startsWith("data: ")) {
			try {
				const jsonStr = line.slice(6); // Remove 'data: ' prefix
				const data = JSON.parse(jsonStr);
				events.push(data);
			} catch (e) {
				continue;
			}
		}
	}
	return events;
};

// Run the benchmark
async function runBenchmark() {
	const originalLog = console.log;
	console.log = (...args) => {
		if (args[0] && typeof args[0] === "string" && args[0].includes("Request")) {
			originalLog(...args);
		}
	};

	const instance = autocannon({
		url: "http://localhost:3000",
		connections: 10,
		amount: 100,
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
					form.append("cached", "true");

					return {
						...request,
						headers: form.getHeaders(),
						body: form.getBuffer(),
					};
				},
				onResponse: async (status, body, context) => {
					totalRequests++;
					const startTime = Date.now();

					try {
						// Log initial response
						// Parse all events from the response
						const events = parseEventStreamData(body);

						let completed = false;
						let jobId = null;

						events.forEach((e) => {
							if (e.state === "completed") {
								completed = true;
								jobId = e.jobId;
								return;
							}
						});
						originalLog(jobId, completed);

						if (jobId) {
							// Wait for and get the PDF
							const result = await fetchResult(jobId);

							const pdfResult = await result.blob();

							originalLog(pdfResult);

							const processingTime = Date.now() - startTime;
							processingTimes.push(processingTime);
							totalProcessingTime += processingTime;
							successfulRequests++;
							completedRequests++;

							originalLog(
								`Request ${completedRequests}/${totalRequests} completed in ${processingTime}ms`
							);

							if (pdfResult.contentType === "application/pdf") {
								originalLog(
									`PDF received. Size: ${pdfResult.data.length} bytes`
								);

								// Check if it's a valid PDF
								const pdfCheck = checkPdfBytes(pdfResult.data);
								originalLog(
									`PDF validation: ${pdfCheck.isValidPdf ? "Valid" : "Invalid"} PDF`
								);
							}
						}
					} catch (error) {
						console.error("Error processing request:", error.message);
						failedRequests++;
						completedRequests++;
					}
				},
			},
		],
		timeout: 120,
	});

	instance.on("done", () => {
		console.log = originalLog;
		// Wait for any in-progress requests to complete
		setTimeout(() => {
			printResults();
			process.exit(0);
		}, 5000);
	});

	originalLog("PDF Generation Benchmark");
	originalLog(`Running ${instance.opts.duration}s test @ ${instance.opts.url}`);
	originalLog(`${instance.opts.connections} connections\n`);

	return instance;
}

runBenchmark().catch((error) => {
	console.error("Benchmark failed:", error);
	process.exit(1);
});
