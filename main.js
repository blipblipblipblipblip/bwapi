import app from "./src/app.js"; // Ensure this path is correct on GitHub!
import serverline from "serverline";
import fs from "fs";
import http from "http";
import util from "util";
import nodemailer from "nodemailer";

// 1. Handle SMTP Password via Environment Variable or File
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

// 2. Logging Setup
const logFilePath = "latest.log";
if (!fs.existsSync(logFilePath)) fs.writeFileSync(logFilePath, ""); 

// 3. CLI Interface
serverline.init();
serverline.setPrompt("> ");
// ... (Keep your serverline.on logic here)

// 4. Custom Logging Functions
function createLogFunction(original) {
    return function(obj) {
        original(obj);
        try {
            fs.appendFileSync(logFilePath, (obj ? obj.toString() : "") + "\n");
        } catch (err) {
            // Silently fail if log file isn't writable
        }
    }
}

console.log = createLogFunction(console.log);
console.error = createLogFunction(console.error);
// ... (Keep your other console overrides)

// 5. SERVER LOGIC (The Fix)
// Render provides the PORT variable. Locally, it defaults to 8080.
const port = process.env.PORT || 8080;

// We use http.createServer because Render's Load Balancer handles the HTTPS part.
const server = http.createServer(app);

server.listen(port, () => {
    console.log(`The server is ready on port ${port}!`);
});

// 6. Error Handling
process.on('SIGTERM', () => {
    server.close(() => {
        process.exit(0);
    });
});

if (smtpPassword) {
    process.on("uncaughtException", (err) => {
        console.error(err.stack || err);
        transport.sendMail({
            from: "\"Production Error\" <no-reply@blocksverse.com>",
            to: "zenith@blocksverse.com",
            subject: "BW2: Production Failed",
            text: `${err.message}\n${err.stack}`,
        }, () => {
            process.exit(1);
        });
    });
}
