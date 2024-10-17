const express = require("#configs/express");
const router = express.Router();

const v1 = require("./v1");

router.get("/", (req, res, next) => {
	return res.ok("Hello, World!");
});
router.use("/v1", v1);

module.exports = router;
