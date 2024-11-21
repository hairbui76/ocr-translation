// src/utils/pdf.js

const PDFDocument = require("pdfkit");
const fs = require("fs");

/**
 * Create PDF from text
 * @param {string} text Text to be converted
 * @returns {Promise<Buffer>} PDF Buffer
 */
async function createPDF(text) {
	return new Promise((resolve, reject) => {
		try {
			if (!text) {
				reject("Text is required");
			}
			if (typeof text !== "string") {
				reject("Text must be a string");
			}
			if (text.length === 0) {
				reject("Text cannot be empty");
			}

			const doc = new PDFDocument();

			const chunks = [];

			doc.on("data", (chunk) => chunks.push(chunk));

			doc.on("end", () => {
				resolve(Buffer.concat(chunks));
			});

			doc.pipe(fs.createWriteStream(`sample/output/output_${Date.now()}.pdf`));
			doc
				.font("sample/font/Roboto-Regular.ttf")
				.fontSize(14)
				.text(text, 100, 100);
			doc.end();
		} catch (error) {
			reject(error);
		}
	});
}

module.exports = {
	createPDF,
};
