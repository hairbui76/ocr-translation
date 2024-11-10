const express = require("#configs/express");
const path = require("path");
const cors = require("cors");

const routes = require("#routes");
const { configs, logger, redis, rateLimit } = require("#configs");
const { errorHandler, notFoundHandler } = require("#middlewares");
const ImageToPdfQueue = require("#utils/ImageToPdfQueue");

const app = express();

/* ------------------ application/json ------------------ */
app.use(express.json());
/* ---------- application/x-www-form-urlencoded --------- */
app.use(
	express.urlencoded({
		extended: true,
	})
);

/* -------------------- Static assets ------------------- */
// app.use(express.static(path.join(__dirname, "public")));

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
		app.use(rateLimit.create(client));

		/* ------------------ Set Redis client ------------------ */
		app.set("redisClient", client);

		/* --------------- Set image to pdf queue --------------- */
		app.set(
			"imageToPdfQueue",
			new ImageToPdfQueue("image-to-pdf-queue", client)
		);

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
