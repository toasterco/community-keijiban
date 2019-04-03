/**
 * Dobby implementation
 */

//#define DOBBY_DEBUG

#include "Dobby.h"

const int    DEFAULT_PORT                     = 443;
const long   OFFSET_TIME                      = 60 * 5;
const long   TASK_INTERVAL_LED                = 200;
const long   TASK_INTERVAL_NTP                = 60000;
const long   TASK_INTERVAL_POLL               = 300000;
const long   TASK_INTERVAL_NOTIFY             = 120000;
const char * GOOGLE_HOME_CONNECTED_SOUND      = "https://actions.google.com/sounds/v1/cartoon/concussive_hit_guitar_boing.ogg";
const char * DEFAULT_LOCALE                   = "en";
const char * MSG_HOME_FREE                    = "[Info] Home is free";
const char * MSG_HOME_NOT_FREE                = "[Info] Home is not free";
const char * MSG_ERROR_DUPLICATE_EVENT        = "[Info] This event has already been tasked.";
const char * MSG_ERROR_NO_HOME                = "[Error] No Home device found";
const char * MSG_ERROR_NO_WIFI                = "[Error] No WIFI connection";
const char * MSG_ERROR_JSON_PARSE_FAILED      = "[Error] Failure in parsing JSON object.";
const char * MSG_ERROR_JSON_INVALID           = "[Error] JSON is either invalid or has no results.";
const char * MSG_ERROR_NTP_TIME_ZERO          = "[Error] NTP Time is 0";
const char * MSG_ERROR_NOTIFICATIONS_EXPIRED  = "[Error] All notifications have expired.";
const char * MSG_ERROR_JSON_CONNECTION_FAILED = "[Error] Connection failed while trying to get JSON";
const char * MSG_DEBUG_FLAG                   = "[Debug] %s\n";
const char * MSG_DEBUG_HEAP                   = "[Debug] Memory Free: %d\n";
const char * MSG_DEBUG_DOBBY_RUN              = "[Debug] Dobby Running";

Dobby::Dobby()
{
  m_canCast         = false;
  m_lightsAreOff    = true;
  m_ntpTime         = 0;
  m_port            = DEFAULT_PORT;
  m_jsonPayload     = "";
  
  m_ghn           = new GoogleHomeNotifier();
  m_notification  = new Notification();
  m_wifiClient    = new WiFiClientSecure();
  m_wifiUDP       = new WiFiUDP();
  m_ntpClient     = new EasyNTPClient(* m_wifiUDP); // dependency: m_wifiUDP
}

Dobby::~Dobby()
{
  clear();
}

void Dobby::clear()
{
  delete m_ghn;
  delete m_notification;
  delete m_wifiUDP;
  delete m_wifiClient;
  delete m_ntpClient;

  m_ghn           = nullptr;
  m_notification  = nullptr;
  m_wifiUDP       = nullptr;
  m_wifiClient    = nullptr;
  m_ntpClient     = nullptr;
}

void Dobby::setup(
  const char * signalID,
  const char * connectionHost,
  const char * connectionURL,
  const char * noticeBoardID
)
{
  m_locale  = DEFAULT_LOCALE;
  m_port    = DEFAULT_PORT;

  defineRequiredMembers(signalID, connectionHost, connectionURL, noticeBoardID);
  run();
}

void Dobby::setup(
  const char * signalID,
  const char * locale,
  const char * connectionHost,
  const char * connectionURL,
  const char * noticeBoardID
)
{
  m_locale  = locale;
  m_port    = DEFAULT_PORT;

  defineRequiredMembers(signalID, connectionHost, connectionURL, noticeBoardID);
  run();
}

void Dobby::setup(
  const char * signalID,
  const int    port,
  const char * connectionHost,
  const char * connectionURL,
  const char * noticeBoardID
)
{
  m_locale = DEFAULT_LOCALE;
  m_port   = port;

  defineRequiredMembers(signalID, connectionHost, connectionURL, noticeBoardID);
  run();
}

void Dobby::setup(
  const char * signalID,
  const char * locale,
  const int    port,
  const char * connectionHost,
  const char * connectionURL,
  const char * noticeBoardID
)
{
  m_locale = locale;
  m_port   = port;

  defineRequiredMembers(signalID, connectionHost, connectionURL, noticeBoardID);
  run();
}

void Dobby::defineRequiredMembers(
  const char * signalID,
  const char * connectionHost,
  const char * connectionURL,
  const char * noticeBoardID
)
{
  m_signalID       = signalID;
  m_connectionHost = connectionHost;
  m_connectionURL  = connectionURL;
  m_noticeBoardID  = noticeBoardID;
  m_jsonURL        = buildJsonURL(m_connectionURL, m_noticeBoardID);
  m_jsonStatusURL  = buildJsonURL(m_connectionURL, m_noticeBoardID, "-status");
}

String Dobby::buildJsonURL(const char * url, const char * noticeBoardID) const
{
  return String(url)
    + String(noticeBoardID)
    + ".json?alt=media";
}

String Dobby::buildJsonURL(const char * url, const char * noticeBoardID, const char * appendString) const
{
  return String(url)
    + String(noticeBoardID)
    + String(appendString)
    + ".json?alt=media";
}


void Dobby::run()
{
  turnBoardLightsOff(true);
  startMDNS();
  #ifdef DOBBY_DEBUG
    Serial.println(MSG_DEBUG_DOBBY_RUN);
  #endif
}

void Dobby::loop()
{

  /**
   * Builtin LED
   *
   * No light = WiFi failed to connect
   * Rapid blink = WiFi connected and trying to connect to Goole Home device
   * Solid = connected to WiFi and Google Home device
   *
   */

  #ifdef DOBBY_DEBUG
    Serial.printf(MSG_DEBUG_HEAP, ESP.getFreeHeap());
  #endif

  if (WiFi.status() != WL_CONNECTED)
  {
    #ifdef DOBBY_DEBUG
      Serial.println(MSG_ERROR_NO_WIFI);
    #endif
    turnBoardLightsOff(true);
    return;
  }
  
  if (WiFi.status() == WL_CONNECTED && !m_canCast)
  {
    blinkLED();
    return;
  }

  // WiFi.status() == WL_CONNECTED && m_canCast
  turnBoardLightsOff(false);
  updateNTPTime();
  getNoticeBoardData();
  notify();

}

void Dobby::getNoticeBoardData()
{
  unsigned long currentMillis = millis();
  if ((currentMillis - m_previousJSONMillis >= TASK_INTERVAL_POLL) || (m_jsonPayload.length() == 0))
  {
    m_previousJSONMillis = currentMillis;
    m_jsonPayload = getJson(m_connectionHost, m_jsonURL, m_jsonPayload);
  }
}

bool Dobby::getHomeStatus()
{
  String payload = getJson(m_connectionHost, m_jsonStatusURL, m_jsonPayload);
  if (payload.startsWith("{\"status\":true"))
  {
    #ifdef DOBBY_DEBUG
      Serial.println(MSG_HOME_FREE);
    #endif
    return true;
  }
  else
  {
    #ifdef DOBBY_DEBUG
      Serial.println(MSG_HOME_NOT_FREE);
    #endif
    return false;
  }
}

String Dobby::getJson(const String host, const String url, const String previousPayload)
{
  if (!m_wifiClient)
  {
    m_wifiClient = new WiFiClientSecure();
  }

  if (!m_wifiClient->connect(host.c_str(), m_port))
  {
    #ifdef DOBBY_DEBUG
      Serial.println(MSG_ERROR_JSON_CONNECTION_FAILED);
    #endif
    return previousPayload;
  }

  m_wifiClient->print(
    String("GET ")
    + url
    + " HTTP/1.1\r\n"
    + "Host: "
    + host
    + "\r\n"
    + "User-Agent: NoticeBoardESP8266\r\n"
    + "Connection: close\r\n\r\n"
  );

  while (m_wifiClient->connected())
  {
    String header = m_wifiClient->readStringUntil('\n');
    if (header == "\r")
    {
      break;
    }
  }

  String payload = m_wifiClient->readString();

  #ifdef DOBBY_DEBUG
    Serial.println(payload);
  #endif
  
  return payload;
}

void Dobby::notify()
{
  unsigned long currentMillis = millis();
  if ((currentMillis - m_previousNotifyMillis >= TASK_INTERVAL_NOTIFY) && (m_ntpTime != 0))
  {
    m_previousNotifyMillis = currentMillis;
    // bufferSize set here: https://arduinojson.org/v5/assistant/
    const size_t bufferSize = JSON_ARRAY_SIZE(3) + JSON_OBJECT_SIZE(2) + 3*JSON_OBJECT_SIZE(6) + 690;
    DynamicJsonBuffer jsonBuffer(bufferSize);

    JsonObject& root = jsonBuffer.parseObject(m_jsonPayload);

    if (!root.success())
    {
      #ifdef DOBBY_DEBUG
        Serial.println(MSG_ERROR_JSON_PARSE_FAILED);
      #endif
      return;
    }

    JsonArray& results = root["results"];

    if (results.size() == 0)
    {
      #ifdef DOBBY_DEBUG
        Serial.println(MSG_ERROR_JSON_INVALID);
      #endif
      return;
    }

    long upperOffsetTime        = m_ntpTime + OFFSET_TIME;
    long lowerOffsetTime        = m_ntpTime - OFFSET_TIME;
    long smallestStartTime      = upperOffsetTime;
    int  smallestStartTimeIndex = -1;

    // Is event within offset
    for (int i = 0; i < results.size(); i++)
    {
      long itemStartTime = results[i]["start_time"].as<long>();

      if ((itemStartTime-lowerOffsetTime) <= (upperOffsetTime-lowerOffsetTime))
      {
        // We have a winner. See if it's the smallest value
        if (itemStartTime < smallestStartTime)
        {
          smallestStartTime = itemStartTime;
          smallestStartTimeIndex = i;
        }
      }
    }

    if (smallestStartTimeIndex < 0)
    {
      #ifdef DOBBY_DEBUG
        Serial.println(MSG_ERROR_NOTIFICATIONS_EXPIRED);
      #endif
      return;
    }

    // We have a winner. Get the current data
    int currentNotifyID   = m_notification->id;
    long currentStartTime = m_notification->start_time;
    bool currentHasPlayed = m_notification->played;

    // Get new data
    JsonObject & nextEvent = results[smallestStartTimeIndex];
    int newNotifyID        = nextEvent["id"].as<int>();
    long newStartTime      = nextEvent["start_time"].as<long>();

    // Check if we have done this already
    if ((currentNotifyID == newNotifyID) && (currentStartTime == newStartTime) && (currentHasPlayed))
    {
      #ifdef DOBBY_DEBUG
        Serial.println(MSG_ERROR_DUPLICATE_EVENT);
      #endif
      return;
    }

    // Create new notification to store new data
    if ((currentNotifyID != newNotifyID) && (currentStartTime != newStartTime))
    {
      Notification * newNotification = new Notification();
      newNotification->id            = nextEvent["id"].as<int>();
      newNotification->type          = nextEvent["type"].as<const char*>();
      newNotification->start_time    = newStartTime;
      newNotification->intent_type   = nextEvent["intent_type"].as<const char*>();
      newNotification->msg           = nextEvent["msg"].as<String>();
      newNotification->played        = false;

      // Delete current pointer and re-point to new object
      delete m_notification;
      m_notification = newNotification;
    }

    long newIntervalTime = _max((long)(newStartTime - m_ntpTime), 0);
    if (newIntervalTime == 0) {
      if (getHomeStatus()) {
        // Send audio notification
        if (m_ghn->play(m_notification->msg.c_str()) != true)
        {
          #ifdef DOBBY_DEBUG
            Serial.println(m_ghn->getLastError());
          #endif
          return;
        }
        m_notification->played = true;
      }
    }
  }
}

void Dobby::updateNTPTime()
{
  unsigned long currentMillis = millis();
  if ((currentMillis - m_previousNTPMillis >= TASK_INTERVAL_NTP) ||  (m_ntpTime == 0))
  {
    m_ntpTime = m_ntpClient->getUnixTime();
    m_previousNTPMillis = currentMillis;
    if (m_ntpTime == 0)
    {
      #ifdef DOBBY_DEBUG
        Serial.println(MSG_ERROR_NTP_TIME_ZERO);
      #endif
    }
  }
}

void Dobby::startMDNS()
{
  // There is a bug in 1.0.6 of GHN which creates a memory leak when running `m_ghn->device` more than once
  // For now just run device once as it boots up MDNS and will continue to look for the home  ¯\_(ツ)_/¯
  if (m_ghn->device(m_signalID, m_locale) != true)
  {
    #ifdef DOBBY_DEBUG
      Serial.println(MSG_ERROR_NO_HOME); 
    #endif
    m_canCast = false;
    return;
  }
  // Found home before timeout...
  m_canCast = true;
  // Send audio confirmation
  if (m_ghn->play(GOOGLE_HOME_CONNECTED_SOUND) != true)
  {
    #ifdef DOBBY_DEBUG
      Serial.printf(MSG_DEBUG_FLAG, m_ghn->getLastError());
    #endif
  }
}

void Dobby::blinkLED()
{
  unsigned long currentMillis = millis();
  if (currentMillis - m_previousLEDMillis >= TASK_INTERVAL_LED)
  {
    toggleLED();
    m_previousLEDMillis = currentMillis;
  }
}

void Dobby::toggleLED()
{
  turnBoardLightsOff(m_lightsAreOff);
  m_lightsAreOff = !m_lightsAreOff;
}

void Dobby::turnBoardLightsOff(const bool isOff) const
{
  digitalWrite(LED_BUILTIN, isOff);
}
