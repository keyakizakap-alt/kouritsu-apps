import { spawn } from "node:child_process";

const input = process.argv.slice(2);
const args = ["dev"];
let hasHostname = false;

for (let index = 0; index < input.length; index += 1) {
  const value = input[index];
  if (value === "--host") {
    args.push("--hostname", input[index + 1] || "0.0.0.0");
    hasHostname = true;
    index += 1;
  } else if (value.startsWith("--host=")) {
    args.push("--hostname", value.slice("--host=".length));
    hasHostname = true;
  } else if (value === "--strictPort") {
    // Next.js already exits when the explicitly requested port is unavailable.
  } else {
    args.push(value);
    if (value === "--hostname") hasHostname = true;
  }
}

if (!hasHostname) args.push("--hostname", "127.0.0.1");

const child = spawn("next", args, { stdio: "inherit", shell: true });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
