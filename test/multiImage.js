const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const http = require("http");

// Track metrics
let totalRequests = 0;
let completedRequests = 0;
let successfulRequests = 0;
let failedRequests = 0;
let totalProcessingTime = 0;
let totalStartTime = 0;
let totalTime = 0;
const processingTimes = [];

// Create table row
const createRow = (stats) => {
	return `┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ Stat     │ 2.5%     │ 50%      │ 97.5%    │ 99%      │ Avg      │ Stdev    │ Max      │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Latency  │ ${stats.p2_5.padEnd(7)}  │ ${stats.p50.padEnd(7)}  │ ${stats.p97_5.padEnd(8)} │ ${stats.p99.padEnd(8)} │ ${stats.avg.padEnd(8)} │ ${stats.stddev.padEnd(8)} │ ${stats.max.padEnd(8)} │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘`;
};

// Calculate statistics for table
const calculateStats = (times) => {
	if (times.length === 0) {
		return {
			p2_5: "N/A    ",
			p50: "N/A    ",
			p97_5: "N/A     ",
			p99: "N/A     ",
			avg: "N/A     ",
			stddev: "N/A     ",
			max: "N/A     ",
		};
	}

	const sorted = times.slice().sort((a, b) => a - b);
	const sum = sorted.reduce((a, b) => a + b, 0);
	const avg = sum / sorted.length;
	const max = sorted[sorted.length - 1];

	// Calculate percentiles
	const p2_5 = sorted[Math.floor(sorted.length * 0.025)] || sorted[0];
	const p50 = sorted[Math.floor(sorted.length * 0.5)] || sorted[0];
	const p97_5 =
		sorted[Math.floor(sorted.length * 0.975)] || sorted[sorted.length - 1];
	const p99 =
		sorted[Math.floor(sorted.length * 0.99)] || sorted[sorted.length - 1];

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
	console.log("\nComplete Flow Latency Statistics:");
	console.log(createRow(calculateStats(processingTimes)));

	console.log("\nSummary:");
	console.log("Total Elapsed Time:", (totalTime / 1000).toFixed(4), "s");
	console.log("Total Requests:", totalRequests);
	console.log("Successful Requests:", successfulRequests);
	console.log("Failed Requests:", failedRequests);
	console.log(
		"Success Rate:",
		`${((successfulRequests / totalRequests) * 100).toFixed(2)}%`
	);

	if (processingTimes.length > 0) {
		console.log("\nProcessing Time Statistics:");
		console.log("  Min:", Math.min(...processingTimes), "ms");
		console.log("  Max:", Math.max(...processingTimes), "ms");
		console.log(
			"  Avg:",
			Math.round(totalProcessingTime / successfulRequests),
			"ms"
		);
	}

	process.exit(0);
};

// Get all image files from a directory
const getImagesFromDirectory = (dirPath) => {
	const files = fs.readdirSync(dirPath);
	return files.filter((file) => {
		const ext = path.extname(file).toLowerCase();
		return [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext);
	});
};

// Function to make HTTP request
const makeRequest = (form) => {
	return new Promise((resolve, reject) => {
		const options = {
			hostname: "localhost",
			port: 3000,
			path: "/api/v1/pdf/upload/array",
			method: "POST",
			headers: form.getHeaders(),
		};

		const req = http.request(options);
		let responseData = "";
		let completed = false;

		req.on("error", (error) => {
			console.error("Request error:", error);
			reject(error);
		});

		req.on("response", (res) => {
			res.on("data", (chunk) => {
				responseData += chunk;
				// Parse each chunk for events
				const events = parseEventStreamData(responseData);
				events.forEach((event) => {
					if (event.state === "completed" && !completed) {
						completed = true;
						resolve({ status: res.statusCode, body: event });
					}
				});
			});

			res.on("end", () => {
				if (!completed) {
					resolve({ status: res.statusCode, body: responseData });
				}
			});
		});

		form.pipe(req);
	});
};

// Parse event stream data
const parseEventStreamData = (data) => {
	const events = [];
	const lines = data.split("\n\n");
	for (const line of lines) {
		if (line.startsWith("data: ")) {
			try {
				const jsonStr = line.slice(6);
				const event = JSON.parse(jsonStr);
				events.push(event);
			} catch (e) {
				// Skip invalid JSON
			}
		}
	}
	return events;
};

// Run a single request
async function runSingleRequest(imageFiles, imagesDir, requestNum) {
	const form = new FormData();

	imageFiles.forEach((filename) => {
		const imageBuffer = fs.readFileSync(path.join(imagesDir, filename));
		form.append("images", imageBuffer, {
			filename: filename,
			contentType: `image/${path.extname(filename).slice(1).replace("jpg", "jpeg")}`,
		});
	});
	form.append("cached", "false");

	totalRequests++;
	const startTime = Date.now();

	try {
		console.log(`Starting request ${requestNum}`);
		const response = await makeRequest(form);
		const processingTime = Date.now() - startTime;

		if (response.status === 200) {
			processingTimes.push(processingTime);
			totalProcessingTime += processingTime;
			successfulRequests++;
			console.log(`Request ${requestNum} completed in ${processingTime}ms`);
		} else {
			failedRequests++;
			console.error(
				`Request ${requestNum} failed with status ${response.status}`
			);
		}

		completedRequests++;
	} catch (error) {
		console.error(`Request ${requestNum} failed with error:`, error);
		failedRequests++;
		completedRequests++;
	}
}

// Run the benchmark
async function runBenchmark() {
	const connections = 5;
	const requestsPerConnection = 5;
	const imagesDir = path.join(__dirname, "../test-ocr");
	totalStartTime = Date.now();

	console.log("Multiple Images Upload Benchmark");
	console.log(`Running test @ http://localhost:3000`);
	console.log(
		`${connections} connections, ${requestsPerConnection} requests per connection\n`
	);

	const imageFiles = getImagesFromDirectory(imagesDir);
	if (imageFiles.length === 0) {
		console.error("No image files found in the specified directory");
		process.exit(1);
	}
	console.log(`Found ${imageFiles.length} images in directory:`, imageFiles);

	// Process requests in batches
	for (let batchIndex = 0; batchIndex < requestsPerConnection; batchIndex++) {
		console.log(
			`\nProcessing batch ${batchIndex + 1}/${requestsPerConnection}`
		);

		const batchPromises = [];
		for (let conn = 0; conn < connections; conn++) {
			const requestNum = batchIndex * connections + conn + 1;
			batchPromises.push(runSingleRequest(imageFiles, imagesDir, requestNum));
		}

		try {
			await Promise.all(batchPromises);
			console.log(`Completed batch ${batchIndex + 1}`);
		} catch (error) {
			console.error(`Error in batch ${batchIndex + 1}:`, error);
		}
	}

	totalTime = Date.now() - totalStartTime;
	printResults();
}

// Add proper error handling
process.on("unhandledRejection", (error) => {
	console.error("Unhandled rejection:", error);
	process.exit(1);
});

runBenchmark().catch((error) => {
	console.error("Benchmark failed:", error);
	process.exit(1);
});
