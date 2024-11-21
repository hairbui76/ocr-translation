// src/configs/logger.js

const pino = require("pino");
const pinoHttp = require("pino-http");

const option = {
	transport: {
		target: "pino-pretty",
		options: {
			colorize: true,
			levelFirst: true,
			sync: false,
		},
	},
};
if (process.env.NODE_ENV !== "production") {
	option.transport.options.ignore = "pid,hostname,reqId,res,req,responseTime";
	option.transport.options.messageFormat =
		"{msg} [{req.method} {res.statusCode} {req.url}:> {responseTime}ms]";
}

const logger = pino(option);

const pinocfg = {
	logger,
	serializers: {
		req: function (req) {
			return {
				...pino.stdSerializers.req(req),
				remoteAddress: req.remoteAddress,
				remotePort: req.remotePort,
				body: req.raw.body,
			};
		},
		res: pino.stdSerializers.res,
		err: pino.stdSerializers.err,
	},
	customLogLevel: function (req, res, err) {
		if (res.statusCode >= 400 && res.statusCode < 500) {
			return "warn";
		} else if (res.statusCode >= 500 || err) {
			return "error";
		}
		return "info";
	},
};

const httpLogger = pinoHttp(pinocfg);

module.exports = httpLogger;

module.exports.logger = logger;
