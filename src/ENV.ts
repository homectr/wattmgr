import fs from 'fs';
const yargs = require('yargs');

export const DEBUG = 'mqttc';

export const argv = yargs
  .options({
    verbose: {
      alias: 'v',
      type: 'string',
      demandOption: true,
      description: 'log verbose level',
    },
    config: {
      alias: 'c',
      type: 'string',
      demandOption: true,
      description: 'configuration file name',
    },
    logfile: {
      alias: 'l',
      type: 'string',
      demandOption: true,
      description: 'log file name',
    },
    console: {
      alias: 'o',
      type: 'boolean',
      description: 'output log to console too',
    },
  })
  .boolean('console').argv;

interface FileConfig {
  mqtt?: {
    clientid: string;
    host: string;
    username?: string;
    password?: string;
    powerTopic: string;
  };
  outputs?: {
    id: string;
    priority: number;
    power: number;
    isPwm?: boolean;
    pwmPoints?: [number, number][];
  }[];
}

const defaultConfig: FileConfig = {
  mqtt: {
    clientid: 'wattmgr',
    host: 'tcp://localhost',
    powerTopic: 'wattmgr/available_power',
  },
  outputs: [],
};

export const config = readConfig(argv.config);

export function readConfig(cfgFileName: string): FileConfig {
  const data = fs.readFileSync(cfgFileName, { encoding: 'utf8', flag: 'r' });
  let cfg: FileConfig = {};
  try {
    cfg = JSON.parse(data);
  } catch (err) {
    console.error(`Error reading configuration from ${cfgFileName} err=${err}`);
  }

  return { ...defaultConfig, ...cfg };
}
