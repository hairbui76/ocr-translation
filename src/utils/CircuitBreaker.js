// src/utils/CircuitBreaker.js

const _CircuitBreaker = require("opossum");

class CircuitBreaker extends _CircuitBreaker {
	constructor(fn) {
		const options = {
			timeout: 3000,
			errorThresholdPercentage: 50,
			resetTimeout: 30000,
		};
		super(fn, options);
	}
}

module.exports = CircuitBreaker;
