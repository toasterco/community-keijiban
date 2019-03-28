/**
 * Dobby implementation
 */

#define _TASK_STD_FUNCTION // Needed to allow lambdas so that we may use member functions

#include <TaskScheduler.h> // This and the above macros are needed in this file, for some reason, to avoid compilation errors. ¯\_(ツ)_/¯
#include "Dobby.h"

const int    DEFAULT_PORT                     = 443;
const long   OFFSET_TIME                      = 60 * 5;
const long   TASK_INTERVAL_LED                = 0.2 * TASK_SECOND;
const long   TASK_INTERVAL_NTP                = 64 * TASK_SECOND;
const long   TASK_INTERVAL_POLL               = 2 * TASK_MINUTE;
const char * GOOGLE_HOME_CONNECTED_SOUND      = "https://actions.google.com/sounds/v1/cartoon/concussive_hit_guitar_boing.ogg";
const char * DEFAULT_LOCALE                   = "en";
const char * MSG_HOME_FREE                    = "[Info] Home is free";
const char * MSG_HOME_NOT_FREE                = "[Info] Home is not free";
const char * MSG_ERROR_DUPLICATE_EVENT        = "[Info] This event has already been tasked.";
const char * MSG_ERROR_NO_WIFI                = "[Error] No WIFI connection";
const char * MSG_ERROR_JSON_PARSE_FAILED      = "[Error] Failure in parsing JSON object.";
const char * MSG_ERROR_JSON_INVALID           = "[Error] JSON is either invalid or has no results.";
const char * MSG_ERROR_NTP_TIME_ZERO          = "[Error] NTP Time is 0";
const char * MSG_ERROR_NOTIFICATIONS_EXPIRED  = "[Error] All notifications have expired.";
const char * MSG_ERROR_JSON_CONNECTION_FAILED = "[Error] Connection failed while trying to get JSON";

Dobby::Dobby()
{
  m_canCast      = false;
  m_lightsAreOff = true;
  m_ntpTime      = 0;
  m_port         = DEFAULT_PORT;

  m_ghn           = new GoogleHomeNotifier();
  m_notification  = new Notification();
  m_taskScheduler = new Scheduler();
  m_wifiClient    = new WiFiClientSecure();
  m_wifiUDP       = new WiFiUDP();
  m_ntpClient     = new EasyNTPClient(* m_wifiUDP); // dependency: m_wifiUDP

  /**
   * Instantiate tasks
   *
   * Task::Task(
   *   unsigned long aInterval,
   *   long          aIterations,
   *   TaskCallback  aCallback,   // Function pointer, function<void()>
   *   Scheduler *   aScheduler,
   *   bool          aEnable,
   *   TaskOnEnable  aOnEnable,   // Function pointer, function<bool()>
   *   TaskOnDisable aOnDisable   // Function pointer, function<void()>
   * )
   *
   * https://github.com/arkhipenko/TaskScheduler/blob/master/src/TaskScheduler.h
   * https://github.com/arkhipenko/TaskScheduler/blob/master/src/TaskSchedulerDeclarations.h
   *
   * The sixth argument is for the onEnable callback and finally got this working after learning that the lambda needed
   * a return value defined, otherwise a compilation error occurs.
   * https://stackoverflow.com/questions/9620098/explicit-return-type-of-lambda
   */
  m_tDeviceStatus = new Task(
    TASK_IMMEDIATE,
    TASK_FOREVER,
    [this]() -> void { setDeviceStatus(); },
    m_taskScheduler,
    false,
    [this]() -> bool { return deviceStatusEnabled(); },
    [this]() -> void { deviceStatusDisabled(); }
  );

  m_tNTP = new Task(
    TASK_INTERVAL_NTP,
    TASK_FOREVER,
    [this]() -> void { getNTPTime(); },
    m_taskScheduler,
    false,
    [this]() -> bool { return ntpEnabled(); },
    [this]() -> void { ntpDisabled(); }
  );

  m_tPoll = new Task(
    TASK_INTERVAL_POLL,
    TASK_FOREVER,
    [this]() -> void { pollNoticeBoard(); },
    m_taskScheduler,
    false,
    [this]() -> bool { return noticeBoardEnabled(); },
    [this]() -> void { noticeBoardDisabled(); }
  );

  m_tNotify = new Task(
    TASK_IMMEDIATE,
    TASK_ONCE,
    [this]() -> void { castAudioToDevice(); },
    m_taskScheduler,
    false,
    [this]() -> bool { return castEnabled(); },
    [this]() -> void { castDisabled(); }
  );

  m_tLedBlink = new Task(
    TASK_INTERVAL_LED,
    TASK_FOREVER,
    [this]() -> void { toggleLED(); },
    m_taskScheduler,
    false,
    [this]() -> bool { return ledBlinkEnabled(); },
    [this]() -> void { ledBlinkDisabled(); }
  );
}

Dobby::~Dobby()
{
  clear();
}

void Dobby::clear()
{
  delete m_ghn;
  delete m_notification;
  delete m_taskScheduler;
  delete m_tDeviceStatus;
  delete m_tNTP;
  delete m_tPoll;
  delete m_tNotify;
  delete m_tLedBlink;
  delete m_wifiUDP;
  delete m_wifiClient;
  delete m_ntpClient;

  m_ghn           = nullptr;
  m_notification  = nullptr;
  m_taskScheduler = nullptr;
  m_tDeviceStatus = nullptr;
  m_tNTP          = nullptr;
  m_tPoll         = nullptr;
  m_tNotify       = nullptr;
  m_tLedBlink     = nullptr;
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
  m_tDeviceStatus->enable();
  m_tNotify->enable();
}

void Dobby::loop()
{
  m_taskScheduler->execute();
}

String Dobby::getJson(const String host, const String url)
{
  // bail if we're cannot make a connection
  if (!m_wifiClient->connect(host.c_str(), m_port)) {
    Serial.println(MSG_ERROR_JSON_CONNECTION_FAILED);
    return "error";
  }

  m_wifiClient->print(
    String("GET ")
    + url
    + " HTTP/1.1\r\n"
    + "Host: "
    + host
    + "\r\n"
    + "User-Agent: ESP8266\r\n"
    + "Connection: close\r\n\r\n"
  );

  while (m_wifiClient->connected()) {
    String header = m_wifiClient->readStringUntil('\n');
    if (header == "\r") {
      break;
    }
  }

  String payload = m_wifiClient->readString();

  return payload;
}

JsonArray & Dobby::getJsonResults()
{
  String payload = getJson(m_connectionHost, m_jsonURL);

  // bufferSize set here: https://arduinojson.org/v5/assistant/
  const size_t bufferSize = JSON_ARRAY_SIZE(5) + JSON_OBJECT_SIZE(1) + 5 * JSON_OBJECT_SIZE(5) + 830;
  DynamicJsonBuffer jsonBuffer(bufferSize);
  JsonObject & root = jsonBuffer.parseObject(payload);

  if (!root.success())
  {
    Serial.println(MSG_ERROR_JSON_PARSE_FAILED);
    return jsonBuffer.createArray();
  }

  return root["results"];
}

bool Dobby::isHomeFree()
{
  String payload = getJson(m_connectionHost, m_jsonStatusURL);

  // bufferSize set here: https://arduinojson.org/v5/assistant/
  const size_t bufferSize = JSON_OBJECT_SIZE(1) + 20;
  DynamicJsonBuffer jsonBuffer(bufferSize);
  JsonObject & root = jsonBuffer.parseObject(payload);

  if (!root.success())
  {
    Serial.println(MSG_ERROR_JSON_PARSE_FAILED);
    return false;
  }

  return root["status"];
}

void Dobby::setDeviceStatus()
{
  // set LED to blink rapidly
  // disable poll task
  // Unset Cast
  // if there's no wifi connection
  if (WiFi.status() != WL_CONNECTED)
  {
    if (!m_tLedBlink->isEnabled())
    {
      m_tLedBlink->setInterval(TASK_INTERVAL_LED);
      m_tLedBlink->enable();
    }

    if (m_tPoll->isEnabled())
    {
      m_tPoll->disable();
    }
  }
  // set LED to solid state and enable poll task if there's a wifi connection
  else
  {
    if (m_tLedBlink->isEnabled())
    {
      m_tLedBlink->disable();
    }

    if (!m_tPoll->isEnabled())
    {
      m_tPoll->enable();
    }

    // Turn on solid light 
    turnBoardLightsOff(false);

    if (!m_canCast)
    {
      if (m_ghn->device(m_signalID, m_locale) != true)
      {
        Serial.println(m_ghn->getLastError());
      } else {
        // Send audio notification of succesfull connection
        // TODO: include check to see when HOME device is not found
        if (m_ghn->play(GOOGLE_HOME_CONNECTED_SOUND) != true)
        {
          Serial.println(m_ghn->getLastError());
        }
        m_canCast = true;
      }
    }
  }
}

bool Dobby::deviceStatusEnabled()
{
  return true;
}

void Dobby::deviceStatusDisabled()
{
  return;
}

void Dobby::pollNoticeBoard()
{
  // bail if there's no wifi connection
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println(MSG_ERROR_NO_WIFI);
    return;
  }

  JsonArray & results = getJsonResults();

  // bail if retrieved JSON cannot be parsed or if empty
  if (results.size() == 0)
  {
    Serial.println(MSG_ERROR_JSON_INVALID);
    return;
  }

  long currentNTPTime = m_ntpClient->getUnixTime();

  if (currentNTPTime == 0)
  {
    Serial.println(MSG_ERROR_NTP_TIME_ZERO);
    return;
  }

  long upperOffsetTime        = currentNTPTime + OFFSET_TIME;
  long lowerOffsetTime        = currentNTPTime - OFFSET_TIME;
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

  if (smallestStartTimeIndex < 0) {
    Serial.println(MSG_ERROR_NOTIFICATIONS_EXPIRED);
    return;
  }

  // We have a winner. Get the current data
  int currentNotifyID   = m_notification->id;
  long currentStartTime = m_notification->start_time;

  // Get new data
  JsonObject & nextEvent = results[smallestStartTimeIndex];
  int newNotifyID        = nextEvent["id"].as<int>();
  long newStartTime      = nextEvent["start_time"].as<long>();

  // Check if we have done this already
  if ((currentNotifyID == newNotifyID) && (currentStartTime == newStartTime))
  {
    Serial.println(MSG_ERROR_DUPLICATE_EVENT);
    return;
  }

  long newIntervalTime = _max((long)(newStartTime - currentNTPTime), 0) * TASK_SECOND;

  // Create new notification to store new data
  Notification * newNotification = new Notification();
  newNotification->id            = nextEvent["id"].as<int>();
  newNotification->type          = nextEvent["type"].as<const char*>();
  newNotification->start_time    = newStartTime;
  newNotification->intent_type   = nextEvent["intent_type"].as<const char*>();
  newNotification->msg           = nextEvent["msg"].as<String>();

  // Delete current pointer and re-point to new object
  delete m_notification;
  m_notification = newNotification;

  m_tNotify->isEnabled()
    ? m_tNotify->setInterval(newIntervalTime)
    : m_tNotify->restartDelayed(newIntervalTime);
}

bool Dobby::noticeBoardEnabled()
{
  return true;
}

void Dobby::noticeBoardDisabled()
{
  return;
}

void Dobby::getNTPTime()
{
  if (WiFi.status() == WL_CONNECTED)
  {
    m_ntpTime = m_ntpClient->getUnixTime();
  }
  else
  {
    m_tNTP->forceNextIteration();
  }
}

bool Dobby::ntpEnabled()
{
  m_ntpTime = 0;
  return true;
}

void Dobby::ntpDisabled()
{
  m_ntpTime = 0;
  return;
}

void Dobby::castAudioToDevice()
{
  // Check if the NoticeBoard app is active
  if (isHomeFree())
  {
    Serial.println(MSG_HOME_FREE);
    if (m_ghn->play(m_notification->msg.c_str()) != true)
    {
      Serial.println(m_ghn->getLastError());
      return;
    }
  }
  else
  {
    Serial.println(MSG_HOME_NOT_FREE);
  }
}

bool Dobby::castEnabled()
{
  return true;
}

void Dobby::castDisabled()
{
  return;
}

void Dobby::toggleLED()
{
  turnBoardLightsOff(m_lightsAreOff);
  m_lightsAreOff = !m_lightsAreOff;
}

bool Dobby::ledBlinkEnabled()
{
  return true;
}

void Dobby::ledBlinkDisabled()
{
  return;
}

void Dobby::turnBoardLightsOff(const bool isOff) const
{
  digitalWrite(LED_BUILTIN, isOff);
}
