import fs from 'fs';
import { exit } from 'process';
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
  mqtt: {
    clientid: string;
    host: string;
    username?: string;
    password?: string;
  };
  optimize: {
    interval: number;
  };
  outputs: {
    id: string;
    /** priority - lower is higher */
    priority: number;
    /** max output power */
    power: number;
    /** duty-cycle enabled? */
    dcEnabled?: boolean; 
    /** duty-cycle function points [dc,power][]*/
    dcFn?: [number, number][]; 
  }[];
}

const defaultConfig: FileConfig = {
  mqtt: {
    clientid: 'wattmgr',
    host: 'tcp://localhost',
  },
  optimize: {
    interval: 15,
  },
  outputs: [],
};

export const config = readConfig(argv.config);

export function readConfig(cfgFileName: string): FileConfig {
  let cfg: FileConfig = defaultConfig; 
  if (!fs.existsSync(cfgFileName)) {
    console.error(`Configuration file ${cfgFileName} not found. If you are running in a container, you may need to check the configuration file in mounted location.`);
    exit(1);
  }
  try {
    const data = fs.readFileSync(cfgFileName, { encoding: 'utf8', flag: 'r' });
    cfg = JSON.parse(data);
  } catch (err) {
    console.error(`Error reading configuration from ${cfgFileName} err=${err}`);
    exit(2);
  }

  return { ...defaultConfig, ...cfg };
}
