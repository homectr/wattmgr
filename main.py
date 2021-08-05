#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import paho.mqtt.client as mqtt
import time
import sys

import signal
import logging

from lib.App import App
from lib.Config import Config
from lib.HomeManager import HomeManager

runScript = True  # global var managing script's loop cycle

def stop_script_handler(msg, logger):
    logger.info(msg)
    global runScript
    runScript = False


# -------------------------------------------------------

# parse commandline aruments and read config file if specified
cfg = Config(sys.argv[1:])

# configure logging
logging.basicConfig(filename=cfg.logfile, level=cfg.logLevel, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

# create logger
log = logging.getLogger('main')

# add console to logger output
log.addHandler(logging.StreamHandler())

log.info("*** HomeManager Starting")

# handle gracefull end in case of service stop
signal.signal(signal.SIGTERM, lambda signo,
              frame: stop_script_handler("Signal SIGTERM received", log))

# handles gracefull end in case of closing a terminal window
signal.signal(signal.SIGHUP, lambda signo,
              frame: stop_script_handler("Signal SIGHUP received", log))

# connect the client to MQTT broker and register a device
print("Creating MQTT client for", cfg.serverUrl)
mqttc = mqtt.Client(cfg.devId)
mqttc.username_pw_set(cfg.username, cfg.password)
mqttc.connect(cfg.serverUrl)

# start thread handling mqtt communication
mqttc.loop_start()

# create object for homemanager
print("Creating HomeManager device as", cfg.devId)
device = HomeManager(cfg.devId, mqttc, 
    qos=cfg.qos, 
    topics={
        "WR_PSS":cfg.topicWR_PSS,
        "TUV":cfg.topicTUV
    })

# create default app object (handles generic mqtt)
app = App(cfg.devId, mqttc, device)
app.start()

try:
    while runScript:
        time.sleep(1)

except KeyboardInterrupt:
    log.info("Signal SIGINT received.")

# perform some cleanup
log.info("Stopping device id=%s", cfg.devId)
app.stop()
log.info('HomeManager stopped.')
