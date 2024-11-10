const configs = {
	BASE: {
		PORT: process.env.PORT || 3000,
		HOSTNAME: process.env.HOST || "127.0.0.1",
		AMBASSADOR_PORT: process.env.AMBASSADOR_PORT || 3001,
		AMBASSADOR_URL: process.env.AMBASSADOR_URL,
		getUrl() {
			if (
				this.HOSTNAME === "localhost" ||
				/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
					this.HOSTNAME
				)
			)
				return `http://${this.HOSTNAME}:${this.PORT}`;
			return `https://${this.HOSTNAME}:${this.PORT}`;
		},
		getTargetServiceUrl() {
			if (this.AMBASSADOR_URL) return this.AMBASSADOR_URL;
			if (
				this.HOSTNAME === "localhost" ||
				/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
					this.HOSTNAME
				)
			)
				return `http://${this.HOSTNAME}:${this.AMBASSADOR_PORT}`;
			return `https://${this.HOSTNAME}:${this.AMBASSADOR_PORT}`;
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
