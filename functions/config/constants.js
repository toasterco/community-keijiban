module.exports = {
  DB_COLLECTIONS: {
    events: 'events',
    users: 'users',
    announcements: 'announcements',
    events_attendance: 'events_attendance',
    groups: 'groups',
    oauth: '_oauth',
    events_to_notify: 'events_to_notify',
    events_cancelled: 'events_cancelled',
    announcements_to_notify: 'announcements_to_notify',
    announcements_cancelled: 'announcements_cancelled'
  },
  DB_FIELDS: {
    events_to_notify: 'events_to_notify',
    announcements_to_notify: 'announcements_to_notify',
    announcements_listened: 'announcements_listened',
    events_to_attend: 'events_to_attend'
  },
  LOCALE: 'en',
  LANGUAGE_CODE: 'en-US',
  SSML_GENDER: 'MALE',
  AUDIO_FILE_BUCKET_URL_PREFIX: 'https://firebasestorage.googleapis.com/v0/b/[PROJECT_ID].appspot.com/o/audio%2F',
  TIMEZONE: 'Asia/Singapore',
  TIMEDIFF: '+08:00',
  DATE_FORMAT: 'MMMM Do, dddd A h:mm', //'DD-MM-YYYY ha'
  TIME_FORMAT: 'ha',
  FIREBASE_TMP_FOLDER: '/tmp',
  JSON_BUCKET_FOLDER: 'notifiers',
  AUDIO_BUCKET_FOLDER: 'audio',
  NOTIFICATIONS_TYPE: {
    announcement: 'notice',
    event: 'invite',
    schedule: 'reminder'
  },
  GOOGLEAPI_REDIRECT: 'https://us-central1-[PROJECT_ID].cloudfunctions.net/oauthcallback',
  GOOGLEAPI_SCOPES: [
    'https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events'
  ],
  API_ORIGIN_WHITELIST: ['https://script.google.com/macros/d/[APPSCRIPT_PROJECT_KEY]/']
};
