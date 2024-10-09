class ApiResponse extends Response {
	/**
	 * Custom Response for API
	 * @param {number} status API status code
	 * @param {string} message Response message
	 * @param {any} data Data to be returned
	 */
	constructor(status, message, data) {
		super();
		this.status = status;
		this.message = message;
		this.data = data;
	}
}