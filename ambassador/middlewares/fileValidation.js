// src/middlewares/fileValidation.js

const ApiError = require("../utils/ApiError");
const { BadRequestError } = ApiError;

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = [
	"image/jpg",
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/tiff",
];

const validateFile = (file) => {
	// Check if file exists
	if (!file) {
		throw new BadRequestError("No file uploaded");
	}

	// Check file size
	if (file.size > MAX_FILE_SIZE) {
		throw new BadRequestError(
			`File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`
		);
	}

	// Check mime type
	if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
		throw new BadRequestError(
			"Invalid file type. Only JPG, JPEG, PNG, WebP and TIFF images are allowed"
		);
	}

	return true;
};

/**
 * Middleware to validate single file upload
 */
const validateSingleFile = (req, res, next) => {
	try {
		if (!req.file) {
			throw new BadRequestError("No file uploaded");
		}
		validateFile(req.file);
		next();
	} catch (error) {
		next(error);
	}
};

/**
 * Middleware to validate multiple files upload
 */
const validateMultipleFiles = (req, res, next) => {
	try {
		if (!req.files || req.files.length === 0) {
			throw new BadRequestError("No files uploaded");
		}

		// Validate each file
		req.files.forEach((file, index) => {
			try {
				validateFile(file);
			} catch (error) {
				throw new BadRequestError(
					`File ${index + 1} (${file.originalname}): ${error.message}`
				);
			}
		});

		next();
	} catch (error) {
		next(error);
	}
};

module.exports = {
	validateSingleFile,
	validateMultipleFiles,
};
