class ApiError extends Error {
	/**
	 * Custom Error for API
	 * @param {number} status HTTP status code
	 * @param {string} message Custom error message
	 */
	constructor(status, message) {
		super();
		this.status = status;
		this.message = message;
	}
}