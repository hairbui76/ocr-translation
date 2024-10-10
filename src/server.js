const express = require("express");
const path = require('path');
const cors = require("cors");

const routes = require("#routes");
const {configs, logger} = require("#configs");
const { errorHandler,notFoundHandler } = require("#middlewares");

const app = express();

/* ------------------ application/json ------------------ */
app.use(express.json());
/* ---------- application/x-www-form-urlencoded --------- */
app.use(express.urlencoded({
	extended: true
}));

/* -------------------- Static assets ------------------- */
app.use(express.static(path.join(__dirname, "..", 'public')));

/* --------------------- Enable CORS -------------------- */
app.use(cors({
	origin: true,
	credentials: true
}))

/* -------------------- Custom logger ------------------- */
app.use(logger)

/* ----------------- All routes traffic ----------------- */
app.use("/api", routes);

/* ------------------ NotFound handler ------------------ */
app.use(notFoundHandler);
/* ------------------ API error handler ----------------- */
app.use(errorHandler)

app.listen(configs.BASE.PORT, configs.BASE.HOSTNAME, () => {
	console.log(`Server listening at ${configs.BASE.getUrl()}`)
})