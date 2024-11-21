// src/utils/hash.js

const crypto = require("crypto");

function simpleImageHash(imageBuffer) {
	// Create a hash object
	const hash = crypto.createHash("sha256");

	// Update the hash object with the image buffer
	hash.update(imageBuffer);

	// Generate the hash digest in hexadecimal format
	return hash.digest("hex");
}

function simpleTranslatedTextHash(text, targetLanguage) {
	// Create a hash object
	const hash = crypto.createHash("sha256");

	// Update the hash object with the translated text
	hash.update(text + targetLanguage);

	// Generate the hash digest in hexadecimal format
	return hash.digest("hex");
}

module.exports = { simpleImageHash, simpleTranslatedTextHash };
