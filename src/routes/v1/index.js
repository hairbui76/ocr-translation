// src/routes/index.js

const express = require("#configs/express");
const router = express.Router();

const pdfRouter = require("./pdf");
const healthRouter = require("./health");

router.use("/pdf", pdfRouter);
router.use("/health", healthRouter);

module.exports = router;
