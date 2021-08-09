#!/bin/bash
#set -x
svcname="wattmgr"
svcfld="wattmgr"

echo "Installing ${svcname} script"

function check_installed {
    local status=$?
    if [ $status -ne 0 ]; then
        echo "error: not installed"
        exit 1
    fi
    echo "ok"
}

function check_running {
    local cnt=`ps aux | grep -c ${1}`
    # assuming running if at least two lines found in ps result
    if [ $cnt -gt 1 ]; then
        echo "ok"
        return 0
    fi
    echo "error: not running"
}

echo "Checking if npm is installed"
npm --version > /dev/null
check_installed

echo "Installing required packages"
npm install

echo "Copying default configuration to /etc"
sudo cp ./install/${svcname}.cfg.example /etc/${svcname}.cfg

echo "Creating log file and configuring logrotate"
sudo touch /var/log/${svcname}.log
sudo cp ./${svcname}.logrotate /etc/logrotate.d/${svcname}
sudo systemctl restart logrotate

echo "Creating service"
sudo cp ./${svcname}.service /etc/systemd/system
sudo systemctl daemon-reload
sudo systemctl enable ${svcname}.service

echo "Starting service"
sudo systemctl start ${svcname}.service

echo "Installation complete"
echo "Modify script configuration in /etc/${svcname}.cfg"
echo "Restart script service using: sudo systemctl restart ${svcname}"
echo "Check service status using: sudo systemctl status ${svcname}"