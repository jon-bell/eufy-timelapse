# eufy-timelapse

Setup backend service, env variables:
```
EUFY_USERNAME=usernameForEufySecurityApp
EUFY_PASSWORD=passwordForEufySecurityApp
EUFY_STATION_SN=StationSerialNumberForEufyCameraFromAppAboutScreen
FRAME_GRAB_INTERVAL_MIN=120
DATA_DIR=/path/to/serve/data
AUTHORIZED_USERNAME_{uid}=username
AUTHORIZED_PASSWORD_{uid}=password
```

Setup frontend site, env variables:
```
REACT_APP_SERVICE_URL=https://path/to/backend
```