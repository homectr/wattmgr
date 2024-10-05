# Description: Dockerfile for server

FROM node:20-slim

RUN mkdir -p /app

WORKDIR /app

# copy project package files
COPY package.json .
COPY yarn.lock .

# copy yarn configuration files
COPY .yarn ./.yarn
COPY .yarnrc.yml .

# install dependencies
RUN yarn workspaces focus --production --all

# copy app files
COPY dist/* .

# copy app configuration files
COPY examples/wattmgr.cfg ./cfg/

# configure logging
COPY examples/wattmgr.logrotate /etc/logrotate.d/wattmgr

# making sure container starts from the right folder
WORKDIR /app

# run server
ENTRYPOINT ["node", "main.js", "-c", "cfg/wattmgr.cfg", "-l", "/var/log/wattmgr/wattmgr.log", "-v", "info"]
