const express = require("#configs/express");
const router = express.Router();

const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage });

const pdfCtrl = require("#controllers/pdf");

router.post(
	"/upload/array",
	upload.array("images"),
	pdfCtrl.processUploadImages
);
router.post("/upload", upload.single("image"), pdfCtrl.processUploadImage);

// Express route for retrieving result
router.get("/result/:jobId", pdfCtrl.getJobResult);

module.exports = router;
