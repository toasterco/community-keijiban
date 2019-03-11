#ifndef DOBBY_H
#define DOBBY_H

#define _TASK_WDT_IDS // To enable task unique IDs
#define _TASK_LTS_POINTER
#define _TASK_STD_FUNCTION // Needed to allow lambdas so that we may use member functions

#include <Arduino.h>
#include <ArduinoJson.h>
#include <EasyNTPClient.h>
#include <ESP8266WiFi.h>
#include <esp8266-google-home-notifier.h>
#include <TaskSchedulerDeclarations.h>
#include <WiFiUdp.h>
#include <WiFiClientSecure.h>

extern const int    DEFAULT_PORT;
extern const long   OFFSET_TIME;
extern const long   TASK_INTERVAL_LED;
extern const long   TASK_INTERVAL_NTP;
extern const long   TASK_INTERVAL_POLL;
extern const char * GOOGLE_HOME_CONNECTED_SOUND;
extern const char * DEFAULT_LOCALE;
extern const char * MSG_ERROR_NO_WIFI;
extern const char * MSG_ERROR_JSON_PARSE_FAILED;
extern const char * MSG_ERROR_JSON_INVALID;
extern const char * MSG_ERROR_NTP_TIME_ZERO;
extern const char * MSG_ERROR_NOTIFICATIONS_EXPIRED;
extern const char * MSG_ERROR_DUPLICATE_EVENT;
extern const char * MSG_ERROR_JSON_CONNECTION_FAILED;

typedef struct Notification {
  int          id;
  long         start_time;
  const char * type;
  const char * intent_type;
  String msg;
} Notification;

/**
 * Dobby definition
 */
class Dobby
{
  public:
    Dobby();
    ~Dobby();
    void loop();
    // 4 versions of setup()
    void setup(
      const char * signalID,
      const char * connectionHost,
      const char * connectionURL,
      const char * noticeBoardID
    );
    void setup(
      const char * signalID,
      const char * locale,
      const char * connectionHost,
      const char * connectionURL,
      const char * noticeBoardID
    );
    void setup(
      const char * signalID,
      const int    port,
      const char * connectionHost,
      const char * connectionURL,
      const char * noticeBoardID
    );
    void setup(
      const char * signalID,
      const char * locale,
      const int    port,
      const char * connectionHost,
      const char * connectionURL,
      const char * noticeBoardID
    );

  private:
    // Variables, primitives followed by compound data types
    bool         m_canCast;
    bool         m_lightsAreOff;
    long         m_ntpTime;
    int          m_port;
    const char * m_signalID;
    const char * m_locale;
    const char * m_connectionHost;
    const char * m_connectionURL;
    const char * m_noticeBoardID;

    String               m_jsonURL;
    String               m_jsonStatusURL;
    GoogleHomeNotifier * m_ghn;
    Notification       * m_notification;
    Scheduler          * m_taskScheduler;
    Task               * m_tDeviceStatus;
    Task               * m_tNTP;
    Task               * m_tPoll;
    Task               * m_tNotify;
    Task               * m_tLedBlink;
    WiFiUDP            * m_wifiUDP;
    WiFiClientSecure   * m_wifiClient;
    EasyNTPClient      * m_ntpClient;

    // Methods
    void defineRequiredMembers(
      const char * signalID,
      const char * connectionHost,
      const char * connectionURL,
      const char * noticeBoardID
    );

    void        clear();
    void        run();
    void        turnBoardLightsOff(const bool isOff) const;
    String      buildJsonURL(const char * url, const char * noticeBoardID) const;
    String      buildJsonURL(const char * url, const char * noticeBoardID, const char * appendString) const;
    String      getJson(const String host, const String url);
    JsonArray & getJsonResults();
    bool        isHomeFree();

    // Task interval callbacks
    void castAudioToDevice();
    void getNTPTime();
    void pollNoticeBoard();
    void setDeviceStatus();
    void toggleLED();

    // Task onEnabled callbacks
    bool castEnabled();
    bool deviceStatusEnabled();
    bool ledBlinkEnabled();
    bool noticeBoardEnabled();
    bool ntpEnabled();

    // Task onDisabled callbacks
    void castDisabled();
    void deviceStatusDisabled();
    void ledBlinkDisabled();
    void noticeBoardDisabled();
    void ntpDisabled();
};

#endif
