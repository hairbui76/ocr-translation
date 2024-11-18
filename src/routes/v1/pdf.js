const express = require("#configs/express");
const router = express.Router();

const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage });

const pdfCtrl = require("#controllers/pdf");

router.post("/upload", upload.array("images"), pdfCtrl.processUploadImage);

// Express route for retrieving result
router.get("/result/:jobId", pdfCtrl.getJobResult);

module.exports = router;
