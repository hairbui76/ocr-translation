// src/primary.js

const cluster = require("cluster");
const os = require("os");

const numCPUs = os.cpus().length;

console.log("Total CPUs: ", numCPUs);
console.log("Primary pid: ", process.pid);

const MAX_WORKERS = 6;

cluster.setupPrimary({
	exec: __dirname + "/server.js",
});

// Fork workers.
if (MAX_WORKERS <= numCPUs) {
	console.log(`Forking ${MAX_WORKERS} processes...`);
	for (let i = 0; i < MAX_WORKERS; i++) {
		console.log(`Forking process number ${i}...`);
		cluster.fork();
	}
}

cluster.on("exit", (worker, _code, _signal) => {
	console.log(`Worker ${worker.process.pid} died`);
	console.log("Starting a new worker");
	cluster.fork();
});
