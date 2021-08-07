#!/usr/bin/env node
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv)).argv;

import 'dotenv/config';

import logger from './logger';

import * as wm from './wattmgr';
import Output from './output';

const log = logger.child({ module: 'app' });
let isRunning = true;

function stop() {
  log.info('Stopping app');
  isRunning = false;
  wm.stop();
  process.exitCode = 0;
}

function start() {
  log.info('Starting app');
  isRunning = true;
  loop();
  wm.start();
}

process.once('SIGINT', function (code) {
  log.debug('SIGINT received... APP');
  stop();
});

process.once('SIGTERM', function (code) {
  log.debug('SIGTERM received... APP');
  stop();
});

function loop() {
  if (isRunning) setTimeout(loop, 10000);
}

wm.addOutput(
  new Output({
    id: '1',
    priority: 3,
    maxPower: 2.5,
    pwmPoints: [
      [0, 0],
      [8, 0.37],
      [9, 0.62],
      [10, 0.83],
      [15, 1.38],
      [20, 1.68],
      [25, 1.863],
      [30, 1.98],
      [35, 2.047],
      [40, 2.097],
      [45, 2.12],
      [50, 2.162],
      [55, 2.5],
      [100, 2.5],
    ],
  })
);
wm.addOutput(new Output({ id: '2', priority: 1, maxPower: 1.0 }));
wm.addOutput(new Output({ id: '3', priority: 4, maxPower: 1.5 }));
start();
