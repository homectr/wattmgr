# Watt Manager

WattManager is MQTT connected app, which tries to optimize distribution of available power between configured power outputs.

WattManager status is published to mqtt topic `{client_id}/status` as ON/OFF.

## How does it work

WattMapager (WM) reads available power from mqtt topic `{client_id}/input`) and switches on, respectively off - if availale power is negative, configured power outputs with a goal to zero-out available power.

## Power Outputs

WM does not manage any physical devices direcly. It switches on/off its virtual outputs.
Unlimited number of outputs can be configured.

Each output has following properties

- `id` - identifier
- `priority` - outputs with higher priority will be turned on \
   before those with lower priority, subject to available power
- `power` - maximum power (in kW) consumed by device controlled by an output
- `pwm_enabled` - optional property - if set to `true`, output's will \
   be managed by pulse-width-modulation 0% = 0 kw, 100% = power specified in `power` property. PWM is \
   linear unless property `pwm_fn` is provided. PWM is published in topic {wm_mqtt_client_id}/output/{output_id}/pwm
- `pwm_fn` - pulse-width-modulation function - array of function data points `[[pwm1,pwr1],[pwm2,pwr2],...[pwm3,pwrN]]`
- `disabled` - optional property - if set to `true`, output will be disabled
- `min_runtime` - optional property - minimum time in seconds for which output will be turned on

## MQTT topics

- `{client_id}/input` - current available power which WM tries to optimize
- `{client_id}/status` - WM status (ON/OFF)
- `{client_id}/alive` - last date-time when WM was alive

- `{client_id}/output/{output_id}` - output status (ON/OFF)
- `{client_id}/output/{output_id}/enabled` - output enabled/disabled status (ON/OFF)
- `{client_id}/output/{output_id}/enabled/set` - command channel to enable/disable output (ON/OFF)
- `{client_id}/output/{output_id}/pwm` - output's PWM value (0-100)
- `{client_id}/output/{output_id}/pwm/set` - command channel to set output's PWM value (0-100)

## Installation

1. clone this repository
2. open cloned repo folder
3. run install `bash ./install.sh`
4. modify configuration according to your needs `sudo nano /etc/wattmgr.cfg`
5. restart service in order to use new configuration `sudo systemctl restart wattmgr.service`
6. check if everything is fine in the log file `sudo less /var/log/wattmgr.log`
