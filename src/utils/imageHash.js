const crypto = require("crypto");

function simpleImageHash(imageBuffer) {
	// Create a hash object
	const hash = crypto.createHash("sha256");

	// Update the hash object with the image buffer
	hash.update(imageBuffer);

	// Generate the hash digest in hexadecimal format
	return hash.digest("hex");
}

module.exports = simpleImageHash;
