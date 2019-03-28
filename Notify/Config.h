/* General */
const int    HTTPS_PORT                  = 443;
const long   BAUD_RATE                   = 115200; // Arduino's int is signed by default with a range of -32,768 to 32,767
/* WiFi Network must be 2.4GHz */
const char * SSID                        = "YOUR_WIFI_NETWORK";
const char * STATION_PASSWORD            = "YOUR_WIFI_PASSWORD";
/* Signal ID */
const char * SIGNAL_BOARD_ID             = "your-signal-id";
/* Google Home details */
const char * HOME_LANG                   = "en";
const char * HOME_ID                     = "YOUR_HOME_SPEAKER_NAME";
/* Firebase */
const char * FIREBASE_HOST               = "firebasestorage.googleapis.com";
const char * FIREBASE_URL                = "/v0/b/[PROJECT_ID].appspot.com/o/notifiers%2F";