#!/usr/bin/env node
import { main } from './cli.js';
import { errMsg } from './util.js';

main(process.argv.slice(2)).catch((err: unknown) => {
  console.error(`react-native-dev-router: ${errMsg(err)}`);
  process.exit(1);
});
