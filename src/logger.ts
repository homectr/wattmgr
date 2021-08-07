import winston from 'winston';
import { format } from 'logform';

const fmt = format.combine(
  format.timestamp(),
  format.printf((info) => `${info.timestamp} [${info.level}] (${info.module}) ${info.message}`)
);

const logger = winston.createLogger({
  level: 'info',
  format: fmt,
  transports: [
    //
    // - Write all logs with level `error` and below to `error.log`
    // - Write all logs with level `info` and below to `combined.log`
    //
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
      level: 'debug',
    })
  );
}

export default logger;
