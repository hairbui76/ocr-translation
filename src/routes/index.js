const express = require("#configs/express");
const router = express.Router();

const configs = require("#configs/configs");

const v1 = require("./v1");

router.get("/", (req, res) => {
	return res.render("index", {
		servicePort: configs.BASE.PORT,
	});
});
router.get("/api", (req, res, next) => {
	return res.ok("Hello, World!");
});
router.use("/api/v1", v1);

module.exports = router;
