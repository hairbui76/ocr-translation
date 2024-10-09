const configs = {
	BASE: {
		PORT: process.env.PORT || 3000,
		HOSTNAME: process.env.URL || "127.0.0.1",
		getUrl() {
			if (this.HOSTNAME === "127.0.0.1" || this.HOSTNAME === "localhost")
				return `http://${this.HOSTNAME}:${this.PORT}`
			return `https://${this.HOSTNAME}:${this.PORT}`
		}
	}
}

module.exports = configs