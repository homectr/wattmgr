import { MqttClient } from 'mqtt/*';
import logger from './logger';
import Output from './output';
import { subscribeWithHandler } from './mqttclient';

const log = logger.child({ module: 'wattmgr' });

export interface WattManagerProps {
  /** mqtt client id */
  clientId: string;
  mqttClient: MqttClient;
  /**
   * optimization interval in seconds
   */
  optimizeInterval?: number;
  /**
   * optional topic from which input will be read
   * if not provided, input will be read from {clientId}/input
   * */
  readInputFrom?: string;
}

export function ltwTopic(clientId: string) {
  return `${clientId}/status`;
}

export class WattManager {
  clientId: string;
  outputs: Output[] = [];
  /** Total max output power of all outputs */
  maxOutputPower: number = 0.0;
  isRunning = false;
  lastReport = 0;
  reportInterval = 1000 * 60 * 1;
  lastOptimize = 0;
  optimizeInterval: number;
  lastAlive = 0;
  aliveInterval = 1000 * 60 * 5;
  topics: Record<'input' | 'output' | 'alive', () => string>;
  mqttClient: MqttClient;
  /** optional topic to read input from  */
  readInputFrom?: string | null;

  constructor(props: WattManagerProps) {
    this.clientId = props.clientId;
    log.info('Creating WattManager');
    this.optimizeInterval = (props.optimizeInterval ?? 15) * 1000; // default 15 seconds
    this.topics = {
      input: () => `${props.clientId}/input`,
      output: () => `${props.clientId}/output`,
      alive: () => `${props.clientId}/alive`,
    };
    this.mqttClient = props.mqttClient;
    this.readInputFrom = props.readInputFrom;
  }

  /** Get total current output power of all outputs */
  public outputPower = () => this.outputs.reduce((t, o) => (t += o.currPower), 0.0);

  public start() {
    log.info('Starting WattManager');

    const topic = this.topics.input();
    log.info(`Subscribing to default input topic. topic=${topic}`);
    const thisObj = this;
    const powerHandler = function (message: string) {
      let n = Number(message);
      if (!Number.isNaN(n)) {
        log.debug(`Received available power = ${n.toFixed(2)}`);
        thisObj.handleAvailablePower(n);
      }
    };
    subscribeWithHandler(topic, powerHandler);
    if (this.readInputFrom) {
      log.info(`Subscribing to provided available power topic=${this.readInputFrom}`);
      subscribeWithHandler(this.readInputFrom, powerHandler);
    }

    this.isRunning = true;

    this.outputs.forEach((o) => {
      o.enable();
      o.close();
    });
    this.loop();
  }

  public stop() {
    log.info('Stopping WattManager');
    this.outputs.forEach((o) => {
      o.close();
    });
    this.mqttClient.publish(ltwTopic(this.clientId), 'OFF', { qos: 1, retain: true });

    // wait for outputs to close
    const thisObj = this;
    setTimeout(() => {
      thisObj.mqttClient.end();
      thisObj.isRunning = false;
    }, 1000);
  }

  public addOutput(o: Output) {
    this.outputs = [...this.outputs, o].sort((a, b) => (a.priority < b.priority ? -1 : 1));
    this.maxOutputPower += o.maxPower;
    const otopic = this.topics.output() + '/' + o.id;
    o.on('open', () => {
      log.debug(`Output opened o=${o.id}`);
      this.mqttClient.publish(`${otopic}`, 'on', { qos: 1 });
    });
    o.on('close', () => {
      log.debug(`Output closed o=${o.id}`);
      this.mqttClient.publish(`${otopic}`, 'off', { qos: 1 });
    });
    o.on('disable', () => {
      log.debug(`Output disabled o=${o.id}`);
      this.mqttClient.publish(`${otopic}/enabled`, 'off', { qos: 1 });
    });
    o.on('enable', () => {
      log.debug(`Output enabled o=${o.id}`);
      this.mqttClient.publish(`${otopic}/enabled`, 'on', { qos: 1 });
    });
    o.on('pwm', (pwm: number) => {
      log.debug(`Output pwm o=${o.id} dc=${pwm}`);
      this.mqttClient.publish(`${otopic}/pwm`, pwm.toString(), { qos: 1 });
    });

    log.info(`Subscribing to ${otopic}/set and ${otopic}/status/set`);
    subscribeWithHandler(`${otopic}/set`, (msg) => o.processCmd('toggle', msg.toLowerCase()));
    subscribeWithHandler(`${otopic}/status/set`, (msg) =>
      o.processCmd('enabled', msg.toLowerCase())
    );
  }

  public handleAvailablePower(availablePower: number) {
    log.debug(`Power changed to ${availablePower.toFixed(2)}`);
    const otopic = this.topics.output();

    // if we are not optimizing, wait for next interval
    if (Date.now() - this.lastOptimize < this.optimizeInterval || availablePower == 0) {
      log.debug(
        `Not optimizing wait=${
          this.optimizeInterval - (Date.now() - this.lastOptimize)
        } pwr=${availablePower}`
      );
      return;
    }
    this.lastOptimize = Date.now();

    /** Power to optimize */
    let pto = this.outputPower();
    // available power is the total power available to all currently open outputs
    pto = pto + availablePower;

    log.debug(`Optimizing power output op=${pto} avail=${availablePower}:`);

    let i = 0;
    while (i < this.outputs.length) {
      let o = this.outputs[i];
      // decrease pto by the actual power output of the current output
      pto = pto - o.setPower(pto);
      log.debug(
        `>  o=${o.id} ena=${o.isEnabled} pwr=${o.getPower().toFixed(2)} pwm=${
          o.pwmEnabled
        } remains=${pto.toFixed(2)}`
      );
      i++;
    }

    const totalOutput = this.outputPower();
    this.mqttClient.publish(otopic, totalOutput.toFixed(2));
    if (Date.now() - this.lastReport > this.reportInterval) {
      log.info(`Available power=${pto.toFixed(2)} kW, outputs=${totalOutput.toFixed(2)} kW`);
      this.lastReport = Date.now();
    }
  }

  public loop() {
    if (Date.now() - this.lastAlive > this.aliveInterval) {
      this.lastAlive = Date.now();
      log.info('Wattmgr alive');
      this.mqttClient.publish(this.topics.alive(), new Date().toISOString(), {
        qos: 1,
        retain: true,
      });
      this.outputs.forEach((o) => {
        if (o.isEnabled) {
          o.emit('enable');
        } else {
          o.emit('disable');
        }
      });
    }

    // longer timeout results in longer wait before service restart
    if (this.isRunning) {
      setTimeout(() => this.loop(), 1000);
    }
  }
}
