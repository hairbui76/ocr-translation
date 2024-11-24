// src/utils/translator.js

const translator = require("open-google-translator");
const CircuitBreaker = require("#utils/CircuitBreaker");
const ApiError = require("./ApiError");
const { InternalServerError } = ApiError;

function _translate(text) {
	return new Promise((resolve, reject) => {
		translator
			.TranslateLanguageData({
				listOfWordsToTranslate: [text],
				fromLanguage: "en",
				toLanguage: "vi",
			})
			.then((data) => {
				resolve(data[0].translation);
			})
			.catch((err) => {
				reject(err);
			});
	});
}

const breaker = new CircuitBreaker(_translate);

const translate = async (text) => {
	try {
		const res = await breaker.fire(text);
		return res;
	} catch (err) {
		throw new InternalServerError(err.message);
	}
};

module.exports = {
	translate: translate,
};
