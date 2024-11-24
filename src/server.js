// src/server.js

const express = require("#configs/express");
const path = require("path");
const cors = require("cors");

const routes = require("#routes");
const { configs, logger, redis } = require("#configs");
const { errorHandler, notFoundHandler } = require("#middlewares");
const { OCRQueue, TranslationQueue } = require("#utils");
const { EventEmitter } = require("events");

EventEmitter.setMaxListeners(Infinity);

const app = express();

/* ------------------ application/json ------------------ */
app.use(express.json());
/* ---------- application/x-www-form-urlencoded --------- */
app.use(
	express.urlencoded({
		extended: true,
	})
);

/* -------------------- Static files -------------------- */
app.use(express.static(path.join(__dirname, "public")));

/* ------------------- EJS View engine ------------------ */
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

/* --------------------- Enable CORS -------------------- */
app.use(
	cors({
		origin: true,
		credentials: true,
	})
);

/* -------------------- Custom logger ------------------- */
app.use(logger);

redis
	.connect()
	.then((client) => {
		/* ----------------- Rate limit middleware --------------- */
		// app.use(rateLimit.create(client));

		/* ------------------ Set Redis client ------------------ */
		app.set("redisClient", client);

		/* --------------- Set image to pdf queue --------------- */
		const translationQueue = new TranslationQueue("translation-queue", client);
		app.set("translationQueue", translationQueue);
		const ocrQueue = new OCRQueue("ocr-queue", client, translationQueue);
		app.set("ocrQueue", ocrQueue);

		/* ----------------- All routes traffic ----------------- */
		app.use(routes);

		/* ------------------ NotFound handler ------------------ */
		app.use(notFoundHandler);

		/* --------------- Response error handler --------------- */
		app.use(errorHandler);

		app.listen(configs.BASE.PORT, configs.BASE.HOSTNAME, () => {
			console.log(`Express server listening at ${configs.BASE.getUrl()}`);
		});
	})
	.catch((error) => {
		console.error("Server startup failed:", error);
		process.exit(1);
	});

module.exports = app;
