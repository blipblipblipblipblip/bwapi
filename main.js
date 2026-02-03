import app from "./dist/app.js"; 
import serverline from "serverline";
import fs from "fs";
import http from "http";
import util from "util";
import nodemailer from "nodemailer";

// 1. SMTP Setup (Prioritize Environment Variable for Render)
const smtpPassword = process.env.SMTP_PASSWORD || (fs.existsSync("conf/smtp_password.txt") ? fs.readFileSync("conf/smtp_password.txt", { "encoding": "utf-8" }) : false);

if(smtpPassword) {
	var transport = nodemailer.createTransport({
		host: "smtp.ionos.com",
		port: 587,
		auth: {
			user: "no-reply@blocksverse.com",
			pass: smtpPassword,
		}
	});
	
	transport.verify(function (error) {
		if (error) {
		  console.error("SMTP Error: " + error);
		} else {
		  console.log("SMTP backend is ready");
		}
	  });  
}

// 2. Logging
const logFilePath = "latest.log";
if (!fs.existsSync(logFilePath)) fs.writeFileSync(logFilePath, ""); 

// 3. CLI Interface (serverline)
serverline.init();
serverline.setPrompt("> ");
serverline.setCompletion(["cache", "exit"]);
serverline.on("line", function(line) {
	if (line == "cache clear") {
		console.log("Clearing world cache..");
		if (typeof invalidateWorldCache === 'function') invalidateWorldCache();
		console.log("Done!");
	} else if (line == "cache peek") {
		console.log("Peeking cache functionality called...");
        // Add your worldCache logic here if needed
	} else if (line == "cache") {
		console.log("Usage: cache [clear|peek|fill]");
	} else {
		console.log("Commands: cache [clear|peek|fill]");
	}
});

serverline.on("SIGINT", function() {
	process.exit(0);
});

// 4. Console Customization
function createLogFunction(original) {
	return function(obj) {
		original(obj);
		try {
            fs.appendFileSync(logFilePath, (obj ? obj.toString() : "") + "\n");
        } catch (e) {}
	}
}

let _log = createLogFunction(console.log);
let _warn = createLogFunction(console.warn);
let _error = createLogFunction(console.error);

console.log = function(obj) {
	if (typeof(obj) == "object") obj = util.inspect(obj, { "colors": true });
	_log("[ LOG ] " + (obj || "undefined"));
}

console.debug = function(obj, userId) {
	if (typeof(obj) == "object") obj = util.inspect(obj, { "colors": true });
	if (userId === undefined) {
		_log("[DEBUG] " + (obj || "undefined"));
	} else {
		_log("[User " + userId + " | DEBUG] " + (obj || "undefined"));
	}
}

console.info = function(obj) {
	_log("[INFO ] " + (obj || "undefined"));
}

console.warn = function(obj) {
	_warn("[WARN ] " + (obj || "undefined"));
}

console.error = function(obj) {
	_error("[ERROR] " + (obj || "undefined"));
}

// 5. Port and Server Logic
// Use Render's port, otherwise 8080
const port = process.env.PORT || 8080;

// Create HTTP server (Render Load Balancer handles the HTTPS/Certs)
const server = http.createServer(app);
server.listen(port, () => {
    console.log(`The server is ready on port ${port}!`);
});

// 6. Global Error Handling
process.on('SIGTERM', () => {
	console.debug('SIGTERM received: closing server');
	server.close(() => {
		process.exit(0);
	});
});

if (smtpPassword) {
	process.on("uncaughtException", (err) => {
		if (err.stack) console.error(err.stack);
		transport.sendMail({
			from: "\"Production Failed\" <no-reply@blocksverse.com>",
			to: "zenith@blocksverse.com",
			subject: "BW2 Error",
			text: err.message + "\n" + err.stack,
		}, (send_err) => {
			if (send_err) console.error(send_err);
			process.exit(1);
		});
	});
}
