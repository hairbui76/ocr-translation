const express = require('express');
const router = express.Router();

const pdfRouter = require("./pdf");

router.use("/pdf", pdfRouter)

module.exports = router;