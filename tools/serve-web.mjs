// Serves a project's web build so a person can play it: on this machine, and on a phone on the same Wi-Fi.
//
//   node tools/serve-web.mjs <project dir> [--port 5188]
//
// A Godot web build only starts on https or localhost. So this serves the build twice:
//   http://localhost:<port>        this machine, and a phone on USB after `adb reverse` (done here if adb sees one)
//   https://<this machine>:<port+1>  any phone on the same network. The certificate is made here and signed by
//                                  nobody, so the phone warns once: choose Advanced, then Proceed.
// Run tools/web-check.mjs first: it makes the build in <project>/build/web. Ctrl+C stops serving.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { gzipWeb, staticHandler } from './godot.mjs';

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const port = Number(flag('--port', 5188)), [project] = args;
const web = project && path.resolve(project, 'build/web');
if (!web || !fs.existsSync(path.join(web, 'index.html'))) { console.error('usage: serve-web.mjs <project dir> [--port 5188]   (needs <project>/build/web: run web-check.mjs first)'); process.exit(2); }
gzipWeb(web);  // about half the bytes over a slow venue network

// the key stays in build/, which no project commits
const key = path.join(path.dirname(web), 'serve.key'), cert = path.join(path.dirname(web), 'serve.crt');
if (!fs.existsSync(cert)) execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '30', '-subj', '/CN=forge web build', '-keyout', key, '-out', cert], { stdio: 'ignore' });

http.createServer(staticHandler(web)).listen(port, '127.0.0.1');
https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, staticHandler(web)).listen(port + 1, '0.0.0.0');

console.log(`this machine:      http://localhost:${port}`);
for (const list of Object.values(os.networkInterfaces())) for (const a of list) if (a.family === 'IPv4' && !a.internal) console.log(`phone on Wi-Fi:    https://${a.address}:${port + 1}   (warns once: Advanced, then Proceed)`);
const usb = spawnSync('adb', ['reverse', `tcp:${port}`, `tcp:${port}`], { encoding: 'utf8' });
console.log(usb.status === 0 ? `phone on USB:      http://localhost:${port}   (adb reverse is set)` : 'phone on USB:      none seen by adb');
