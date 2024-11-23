const BASE_URL = `${window.location.protocol}//${window.location.hostname}:${PORT}/api/v1/pdf`;

const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

const uploadForm = $("#uploadForm");
const imageInput = $("#imageInput");
const folderInput = $("#folderInput");
const cached = $("#cached");
const folderSupported = $("#folder");
const uploadButton = $("#uploadButton");
const resultDiv = $("#result");
const loader = $("#loader");
const progressBar = $("#progressBar");
const pdfResultsContainer = $("#pdf-results-container");

function createProgressBar(fileName) {
	const progressElement = document.createElement("div");
	progressElement.className = "file-progress";
	progressElement.innerHTML = `
			<div class="file-info">
							<span class="file-name">${fileName}</span>
							<span class="progress-percentage">0%</span>
			</div>
			<div class="progress-bar">
							<div class="progress"></div>
			</div>
			<div class="error-tooltip"></div>
	`;
	return progressElement;
}

function updateProgress(progressElement, progress) {
	const progressBar = progressElement.querySelector(".progress");
	const percentageText = progressElement.querySelector(".progress-percentage");
	progressBar.style.width = `${progress}%`;
	percentageText.textContent = `${progress}%`;
}

function markProgressAsError(progressElement, errorMessage) {
	progressElement.classList.add("error");
	const tooltip = progressElement.querySelector(".error-tooltip");
	tooltip.textContent = errorMessage;
	const progressBar = progressElement.querySelector(".progress");
	progressBar.style.width = "100%";
	const percentageText = progressElement.querySelector(".progress-percentage");
	percentageText.textContent = "Failed";
}

folderSupported.addEventListener("change", function (e) {
	const folderInput = $(".folder-input");
	const fileInput = $(".file-input");
	const label = $(".file-input-label");
	const folder = e.target.checked;

	if (folder) {
		folderInput.style.display = "block";
		fileInput.style.display = "none";
		label.textContent = "Choose Folder";
		label.setAttribute("for", "folderInput");
	} else {
		folderInput.style.display = "none";
		fileInput.style.display = "block";
		label.textContent = "Choose File";
		label.setAttribute("for", "imageInput");
	}
});

folderInput.addEventListener("change", function (e) {
	const files = e.target.files;
	const label = $(".file-input-label");
	const folderName = files.length
		? files[0].webkitRelativePath.split("/")[0]
		: "Choose Folder";

	label.textContent = folderName;
	uploadButton.disabled = !files.length;

	const fileCountElement = $("#fileCount");
	fileCountElement.textContent = `${files.length} files are uploaded`;
});

imageInput.addEventListener("change", function (e) {
	const files = e.target.files;
	const label = $(".file-input-label");

	label.textContent = files.length ? files[0].name : "Choose File";
	uploadButton.disabled = !files.length;

	const fileCountElement = $("#fileCount");
	fileCountElement.textContent = `${files.length} files are uploaded`;
});

uploadForm.addEventListener("submit", async (e) => {
	e.preventDefault();
	$("#tabButtons").innerHTML = "";
	$("#pdf-results-container").innerHTML = "";

	const formData = new FormData();
	const files = folderSupported.checked ? folderInput.files : imageInput.files;
	const progressContainer = $("#progressContainer");
	progressContainer.innerHTML = ""; // Clear previous progress bars

	// Create progress tracking object
	const progressBars = new Map();

	for (const file of files) {
		formData.append(files.length > 1 ? "images" : "image", file);
		const progressElement = createProgressBar(file.name);
		progressContainer.appendChild(progressElement);
		progressBars.set(file.name, progressElement);
	}

	formData.append("cached", cached.checked);

	resultDiv.textContent = "Uploading...";
	loader.style.display = "block";
	uploadButton.disabled = true;

	try {
		const uploadUrl =
			files.length > 1 ? `${BASE_URL}/upload/array` : `${BASE_URL}/upload`;

		const response = await fetch(uploadUrl, {
			method: "POST",
			body: formData,
		});

		if (response.body) {
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let jobIds = new Map();
			let isDone = false;

			while (!isDone) {
				const { value, done } = await reader.read();
				if (done) break;

				const events = decoder.decode(value).split("\n\n");
				for (const event of events) {
					if (event.startsWith("data: ")) {
						const data = JSON.parse(event.slice(6));
						console.log("Received update:", data);

						if (data.state === "failed") {
							console.error("Job failed, reason:", data.error, data.jobId);
							jobIds.delete(data.jobId);
							const progressElement = progressBars.get(data.fileName);
							if (progressElement) {
								markProgressAsError(
									progressElement,
									data.error || "An unknown error occurred"
								);
							}
						} else {
							if (data.state === "active") {
								const progressElement = progressBars.get(data.fileName);
								if (progressElement) {
									updateProgress(progressElement, data.progress);
								}
								resultDiv.textContent += `Progress: ${data.progress}% for file ${data.fileName}\n`;
							} else {
								if (data.jobId && data.fileName) {
									jobIds.set(data.jobId, data.fileName);
									resultDiv.textContent += `Job ID: ${data.jobId} for file ${data.fileName}\n`;
								}
							}
						}
					}
				}
			}

			for (const [jobId, fileName] of jobIds) {
				fetchResult(jobId, fileName);
			}
		} else {
			console.error("Response body is not readable");
		}
	} catch (error) {
		console.error(error);
		resultDiv.textContent = "Error: " + error.message;
		loader.style.display = "none";
		uploadButton.disabled = false;
	}
});

function shortenText(text, numChars) {
	return text.length > numChars ? text.slice(0, numChars) + "..." : text;
}

async function fetchResult(jobId, fileName) {
	console.log(`Fetching result for job ${jobId}`);
	try {
		const response = await fetch(`${BASE_URL}/result/${jobId}`);
		console.log(
			`Received response for job ${jobId}, status: ${response.status}`
		);

		if (response.headers.get("Content-Type") === "application/pdf") {
			console.log("Received PDF, creating blob URL");
			const pdfBlob = await response.blob();
			const pdfUrl = URL.createObjectURL(pdfBlob);

			const tabButtons = $("#tabButtons");
			const button = document.createElement("button");
			button.className = "tab-button";
			button.textContent = `${fileName.length > 20 ? shortenText(fileName, 20) : fileName}`;
			tabButtons.appendChild(button);

			// Create PDF container
			const pdfContainer = document.createElement("div");
			pdfContainer.className = "pdf-container";
			const pdfViewer = document.createElement("iframe");
			pdfViewer.className = "pdf-viewer";
			pdfViewer.src = pdfUrl;
			pdfContainer.appendChild(pdfViewer);
			pdfResultsContainer.appendChild(pdfContainer);

			// If this is the first PDF, make it active
			if (tabButtons.children.length === 1) {
				button.classList.add("active");
				pdfContainer.classList.add("active");
			}

			// Add click event to tab button
			button.addEventListener("click", () => {
				// Remove active class from all buttons and containers
				$$(".tab-button").forEach((btn) => btn.classList.remove("active"));
				$$(".pdf-container").forEach((container) =>
					container.classList.remove("active")
				);

				// Add active class to clicked button and its container
				button.classList.add("active");
				pdfContainer.classList.add("active");
			});

			resultDiv.textContent += `Processing completed for job ${jobId}! PDF added to tabs.\n`;
			loader.style.display = "none";
			uploadButton.disabled = false;
		} else {
			console.log("Response is not a PDF, parsing as JSON");
			const data = await response.json();
			console.log(data.state);
			if (data.state === "completed") {
				console.log("State is completed, but did not receive PDF. Retrying...");
				setTimeout(() => fetchResult(jobId), 1000);
			} else if (data.error) {
				console.error(`Error: ${data.error}`);
				resultDiv.textContent += `Error for job ${jobId}: ${data.error}\n`;
				loader.style.display = "none";
				uploadButton.disabled = false;
			} else {
				console.log(`Job not yet completed, state: ${data.state}`);
				resultDiv.textContent += `Status for job ${jobId}: ${data.state}\n`;
				setTimeout(() => fetchResult(jobId), 1000);
			}
		}
	} catch (error) {
		console.error("Error fetching result:", error);
		resultDiv.textContent = "Error fetching result: " + error.message;
		loader.style.display = "none";
		uploadButton.disabled = false;
	}
}
