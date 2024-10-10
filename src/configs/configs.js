const configs = {
	BASE: {
		PORT: process.env.PORT || 3000,
		HOSTNAME: process.env.URL || "127.0.0.1",
		getUrl() {
			if (this.HOSTNAME === "127.0.0.1" || this.HOSTNAME === "localhost")
				return `http://${this.HOSTNAME}:${this.PORT}`;
			return `https://${this.HOSTNAME}:${this.PORT}`;
		},
	},
	REDIS: {
		PORT: process.env.REDIS_PORT || 6379,
		HOST: process.env.REDIS_HOST || "127.0.0.1",
		URI: process.env.REDIS_URI || null,
		getUrl() {
			if (this.URI) return this.URI;
			return `redis://${this.HOST}:${this.PORT}`;
		},
	},
};

module.exports = configs;
