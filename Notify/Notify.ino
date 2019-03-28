/**
   * LED Status
   *
   * No light = WiFi WiFiManager mode
   * Rapid blink = failed to connect to WiFi
   * Solid = connected to WiFi
   *
   */
#include <Arduino.h>
#include <ESP8266WebServer.h>

#include "Config.h"
#include "Dobby.h"

Dobby dobby;

/**
 * Do start up things needed for noticeboard...
 * @returns {void}
 */
void setup()
{
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, HIGH);

  Serial.begin(BAUD_RATE);
  Serial.println();

  WiFi.mode(WIFI_STA);
  WiFi.begin(SSID, STATION_PASSWORD);

  while (WiFi.status() != WL_CONNECTED)
  {
    delay(250);
    Serial.print(".");
  }

  /**
   * Instantiate Dobby to run and monitor our tasks
   *
   * Dobby::setup(
   *   const char * signalID,
   *   const char * locale, (optional)
   *   const int    port,   (optional)
   *   const char * connectionHost,
   *   const char * connectionURL,
   *   const char * noticeBoardID
   * );
   */
  dobby.setup(
    HOME_ID,
    HOME_LANG,
    HTTPS_PORT,
    FIREBASE_HOST,
    FIREBASE_URL,
    SIGNAL_BOARD_ID
  );
}

void loop()
{
  dobby.loop();
}
