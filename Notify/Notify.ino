/**
   * LED Status
   *
   * No light = WiFi WiFiManager mode
   * Rapid blink = failed to connect to WiFi
   * Solid = connected to WiFi
   *
   */
#include <FS.h>
#include <Arduino.h>
#include <DNSServer.h>
#include <ESP8266WebServer.h>
#include <WiFiManager.h>
#include <DoubleResetDetect.h>

#include "Config.h"
#include "Dobby.h"

#define DRD_TIMEOUT 1.0
#define DRD_ADDRESS 0x00

Dobby dobby;
DoubleResetDetect drd(DRD_TIMEOUT, DRD_ADDRESS);

bool wifiManagerOkToSaveLocal = false;
bool wifiManagerInitialConfig = false;
char NOTICE_BOARD_ID[200];
char HOME_ID[200];

void wifiManagerSaveLocalStorageCallback()
{
  Serial.println("wifiManagerSaveLocalStorageCallback:: Should save config");
  wifiManagerOkToSaveLocal = true;
}

void wifiManagerLoadLocalStorage()
{
  if (SPIFFS.begin())
  {
    //SPIFFS.format();
    if (SPIFFS.exists("/config.json"))
    {
      File configFile = SPIFFS.open("/config.json", "r");
      if (configFile)
      {
        size_t size = configFile.size();
        // Allocate a buffer to store contents of the file.
        std::unique_ptr<char[]> buf(new char[size]);

        configFile.readBytes(buf.get(), size);
        DynamicJsonBuffer jsonBuffer;
        JsonObject& json = jsonBuffer.parseObject(buf.get());
        json.printTo(Serial);
        if (json.success())
        {
          strcpy(NOTICE_BOARD_ID, json["NOTICE_BOARD_ID"]);
          strcpy(HOME_ID, json["HOME_ID"]);
        }
        configFile.close();
      }
    }
  }
  else {
    Serial.println("wifiManagerLoadLocalStorage:: cannot mount storage");
  }
}

void wifiManagerSaveLocalStorage()
{
  Serial.println("wifiManagerSaveLocalStorage:: saving config");
  DynamicJsonBuffer jsonBuffer;
  JsonObject& json = jsonBuffer.createObject();
  json["NOTICE_BOARD_ID"] = NOTICE_BOARD_ID;
  json["HOME_ID"] = HOME_ID;

  File configFile = SPIFFS.open("/config.json", "w");
  if (!configFile) {
    Serial.println("wifiManagerSaveLocalStorage:: failed to open config file for writing");
  }

  json.printTo(Serial);
  json.printTo(configFile);
  configFile.close();
  //end save
}

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

  // Load local data
  wifiManagerLoadLocalStorage();

  // Do we have everything stored to work
  if (WiFi.SSID() == "" || NOTICE_BOARD_ID == "" || HOME_ID == "")
  {
    Serial.println("setup:: Info missing need to start captive portal");
    wifiManagerInitialConfig = true;
  }

  // Check if reset was requested
  if (drd.detect())
  {
    Serial.println("setup:: Reset requested");
    //wifiManager.resetSettings();
    wifiManagerInitialConfig = true;
  }

  if (wifiManagerInitialConfig)
  {
    WiFiManagerParameter custom_noticeBoardId(WIFI_NOTICE_BOARD_ID, WIFI_NOTICE_BOARD_TEXT, NOTICE_BOARD_ID, 120, WIFI_PARAMETER_ATTRIBUTES);
    WiFiManagerParameter custom_homeId(WIFI_HOME_ID, WIFI_HOME_ID_TEXT, HOME_ID, 120, WIFI_PARAMETER_ATTRIBUTES);

    WiFiManager wifiManager;
    wifiManager.setSaveConfigCallback(wifiManagerSaveLocalStorageCallback);

    wifiManager.addParameter(&custom_noticeBoardId);
    wifiManager.addParameter(&custom_homeId);

    wifiManager.startConfigPortal(SSID, STATION_PASSWORD);

    strcpy(NOTICE_BOARD_ID, custom_noticeBoardId.getValue());
    strcpy(HOME_ID, custom_homeId.getValue());

    Serial.println("---------------------------");
    Serial.println(NOTICE_BOARD_ID);
    Serial.println(HOME_ID);
    Serial.println(HOME_LANG);
    Serial.println("---------------------------");

    // Save local data
    if (wifiManagerOkToSaveLocal)
    {
      wifiManagerSaveLocalStorage();
      ESP.restart();
    }
  }

  WiFi.mode(WIFI_STA);
  int connRes = WiFi.waitForConnectResult();

  if (WiFi.status()!=WL_CONNECTED){
    Serial.println("setup:: failed to connect");
  } else{
    Serial.print("setup:: local ip: ");
    Serial.println(WiFi.localIP());
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
    NOTICE_BOARD_ID
  );
}

/**
 * Do start up things needed for noticeboard...
 * @returns {void}
 */
void loop()
{
  dobby.loop();
}