const express = require("#configs/express");
const router = express.Router();
const status = require("http-status");

const v1 = require("./v1");

router.get("/", (req, res) => {
	res.status(status.OK).send("Hello World!");
});
router.use("/v1", v1);

module.exports = router;
