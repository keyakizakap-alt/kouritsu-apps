import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

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

// Run the local Next.js CLI directly. With shell: true, arguments such as
// `--host "x; rm -rf ~"` would be interpreted by the shell.
const child = spawn(
  process.execPath,
  [
    fileURLToPath(
      new URL("../node_modules/next/dist/bin/next", import.meta.url),
    ),
    ...args,
  ],
  { stdio: "inherit" },
);
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
