#!/usr/bin/env node
// Legacy entrypoint retained for existing skill installations and scripts.
import { runCli } from './cli.mjs';
await runCli();
