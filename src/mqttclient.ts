import mqtt from 'mqtt';
import * as ENV from './ENV';
import logger from './logger';
import { ltwTopic } from './wattmgr';

const log = logger.child({ module: 'mqttc' });
const clientId = ENV.config.mqtt?.client_id ?? 'wattmgr';

export const LWTtopic = ltwTopic(clientId);

const options: mqtt.IClientOptions = {
  clientId: clientId,
  username: ENV.config.mqtt?.username,
  password: ENV.config.mqtt?.password,
  will: {
    topic: LWTtopic,
    payload: Buffer.from('OFF'),
    qos: 1,
    retain: true,
  },
};

log.info(
  `Connecting to MQTT host ${ENV.config.mqtt?.host}: clientId=${options.clientId} username=${
    options?.username ?? 'none'
  } password=${options?.password ? 'yes' : 'no'}`
);
export const client = mqtt.connect(ENV.config.mqtt?.host, options);

export type mgs_handler_t = (message: string) => boolean;

export const getErrorHandler = (topic: string) => {
  return function (err: Error | null) {
    if (err) log.error(`Error subscribing to topic=${topic} err=${err}`);
  };
};

export function subscribeWithHandler(topic: string, handlerFn: (msg: string) => void) {
  client.subscribe(topic, getErrorHandler(topic));
  client.on('message', (t, message) => {
    if (t !== topic) return;
    const msg = message.toString();
    log.debug(`MQTT received topic=${topic} msg=${msg}`);
    handlerFn(msg);
  });
}

client.on('connect', function () {
  log.info('MQTT connected');
  client.publish(LWTtopic, 'ON', { qos: 1, retain: true });
});

client.on('error', function (err) {
  log.error(`MQTT error: ${err}`);
});

client.on('reconnect', function () {
  log.info('MQTT reconnecting');
});

export default client;
