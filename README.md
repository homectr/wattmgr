# Watt Manager

WattManager is MQTT connected app, which tries to optimize available power consumption using pre-set power outputs ("devices").

## How does it work

WattMapager (WM) takes as input currently available power and switches on, respectively off - if availale power is negative, configured power outputs with a goal to zero-out available power.

## Power Outputs

WM does not manage any phisical devices direcly. It switches on/off its virtual outputs.
Unlimited number of outputs can be configured.

Each output has following properties

- `id` - identifier
- `priority` - outputs with higher priority will be turned on before those with lower priority, subject to available power
- `power` - maximum power (in kW) consumed by device controlled by an output
- `dcEnabled` - optional property - if set to `true`, output's will be managed by duty-cycle 0% = 0 kw, 100% = power specified in `power` property. Duty-cycle is linear unless property `dcfn` is provided. Duty cycle is published in topic {wm_mqtt_client_id}/output/{output_id}/dc
- `dcfn` - duty-cycle function - actually array of function data points `[[dc1,pwr1],[dc2,pwr2],...[dcN,pwrN]]`
- `statusTopic` - mqtt topic to which output status (ON/OFF) will be published
- `dcTopic` - mqtt topic to which output's duty-cycle value (0-100) will be published

## MQTT topics
- `{client_id}/input` - current available power which WM tries to optimize
- `{client_id}/output/{output_id}` - output status (ON/OFF)
- `{client_id}/output/{output_id}/enabled` - output enabled/disabled status (ON/OFF)
- `{client_id}/output/{output_id}/enabled/set` - command channel to enable/disable output (ON/OFF)
- `{client_id}/output/{output_id}/dc` - output's duty-cycle value (0-100)

## Installation

1. clone this repository
2. open cloned repo folder
3. run install `bash ./install.sh`
4. modify configuration according to your needs `sudo nano /etc/wattmgr.cfg`
5. restart service in order to use new configuration `sudo systemctl restart wattmgr.service`
6. check if everything is fine in the log file `sudo less /var/log/wattmgr.log`
