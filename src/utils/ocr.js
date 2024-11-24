// src/utils/ocr.js

const tesseract = require("node-tesseract-ocr");
const CircuitBreaker = require("#utils/CircuitBreaker");
const ApiError = require("#utils/ApiError");
const { InternalServerError } = ApiError;

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

module.exports = {
	image2text: image2text,
};
