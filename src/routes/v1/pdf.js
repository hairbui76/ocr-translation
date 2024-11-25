// src/routes/pdf.js

const express = require("#configs/express");
const router = express.Router();

const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage });

const pdfCtrl = require("#controllers/pdf");
const {
	validateMultipleFiles,
	validateSingleFile,
} = require("#middlewares/fileValidation");

router.post(
	"/upload/array",
	upload.array("images"),
	validateMultipleFiles,
	pdfCtrl.processUploadImages
);
router.post(
	"/upload",
	upload.single("image"),
	validateSingleFile,
	pdfCtrl.processUploadImage
);

// Express route for retrieving result
router.get("/result/:jobId", pdfCtrl.getJobResult);

module.exports = router;
