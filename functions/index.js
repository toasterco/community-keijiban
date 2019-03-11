'use strict';

const { OAuth2Client } = require('google-auth-library');
const {
  dialogflow,
  SimpleResponse
} = require('actions-on-google');
const functions = require('firebase-functions');

const googleApiCredentials = require('./keys/calendar.json');
const DBManager = require('./managers/db-manager');
const UsersManager = require('./managers/users-manager');
const EventsManager = require('./managers/events-manager');
const AnnouncementsManager = require('./managers/announcements-manager');
const GroupsManager = require('./managers/groups-manager');
const CalendarsManager = require('./managers/calendars-manager');
const EventsAttendanceManager = require('./managers/events-attendance-manager');
const JSONManager = require('./managers/json-manager');
const TTSManager = require('./managers/tts-manager');

const {
  eventsWriteTrigger,
  announcementsWriteTrigger
} = require('./handlers/events-announcements-trigger');

const {
  broadcastEventsAndAnnouncements
} = require('./handlers/broadcast-events-and-anouncements-handler');

const IntentHandler = require('./handlers/intents-handler');

const {
  groupsWriteTrigger
} = require('./handlers/groups-trigger');

const CONSTANTS = require('./config/constants');
const INTENT_CONSTANTS = require('./config/intent-constants');
const KEYS = require('./keys/constants');

const GOOGLEAPI_CLIENT_ID = googleApiCredentials.web.client_id;
const GOOGLEAPI_SECRET_KEY = googleApiCredentials.web.client_secret;
const GOOGLEAPI_REDIRECT = CONSTANTS.GOOGLEAPI_REDIRECT;
const SCOPES = CONSTANTS.GOOGLEAPI_SCOPES;

const _functionsOauthClient = new OAuth2Client(
  GOOGLEAPI_CLIENT_ID,
  GOOGLEAPI_SECRET_KEY,
  GOOGLEAPI_REDIRECT
);

const originWhitelist = CONSTANTS.API_ORIGIN_WHITELIST;

const corsOptions = {
  origin: (origin, callback) => {
    if (originWhitelist.indexOf(origin) !== -1) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  }
};

const cors = require('cors')(corsOptions);

const _dbManager = new DBManager(functions.config().firebase);
const managers = {
  users: new UsersManager(_dbManager.getFirebaseAdmin()),
  events: new EventsManager(_dbManager.getFirebaseAdmin()),
  announcements: new AnnouncementsManager(_dbManager.getFirebaseAdmin()),
  groups: new GroupsManager(_dbManager.getFirebaseAdmin()),
  calendars: new CalendarsManager(_functionsOauthClient, _dbManager),
  events_attendance: new EventsAttendanceManager(_dbManager.getFirebaseAdmin()),
  json: new JSONManager(_dbManager.getFirebaseAdmin()),
  tts: new TTSManager(_dbManager.getFirebaseAdmin())
};

const app = dialogflow({
  debug: true,
  clientId: KEYS.ACTIONS_ON_GOOGLE_CLIENT_ID,
});


app.middleware((conv) => {
});

Object.keys(INTENT_CONSTANTS).forEach((intentKey) => {
  const intent = INTENT_CONSTANTS[intentKey];
  if (IntentHandler[intent.handler]) {
    app.intent(intent.intent, (conv, params, registered) => {
      return IntentHandler[intent.handler](conv, params, registered, managers);
    });
  }
});

exports.dialogflowWebhook = functions.https.onRequest(app);

exports.eventsUpdatedTrigger = functions.database
  .ref('/events/{eventId}')
  .onWrite(eventsWriteTrigger);

exports.announcementsUpdatedTrigger = functions.database
  .ref('/announcements/{announcementId}')
  .onWrite(announcementsWriteTrigger);

exports.groupsUpdatedTrigger = functions.database
  .ref('/groups/{groupId}')
  .onWrite((snapshot, context) => {
    return groupsWriteTrigger(snapshot, context, managers);
  });

exports.usersUpdatedTrigger = functions.database
  .ref('/users/{userId}')
  .onWrite((snapshot, context) => {
    const currentData = snapshot.after.val();
    console.log('user updated', currentData.id);

    return managers.json.constructJSON(currentData.id, managers);
  });

exports.broadcastEventsAndAnnouncements = functions.https
  .onRequest((request, response) => {
    // cors(request, response, () => {});
    return broadcastEventsAndAnnouncements(request, response, managers);
  });


// this is for setting up google calendar authentication
// visit the URL for this Function to request tokens
exports.authgoogleapi = functions.https.onRequest((req, res) => {
  res.set('Cache-Control', 'private, max-age=0, s-maxage=0');
  res.redirect(_functionsOauthClient.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  }));
});

// setup for OauthCallback
// after you grant access, you will be redirected to the URL for this Function
// this Function stores the tokens to your Firebase database
exports.oauthcallback = functions.https.onRequest((req, res) => {
  res.set('Cache-Control', 'private, max-age=0, s-maxage=0');
  const code = req.query.code;
  _functionsOauthClient.getToken(code, (err, tokens) => {
    // Now tokens contains an access_token and an optional refresh_token. Save them.
    if (err) {
      return res.status(400).send(err);
    }
    return _dbManager.storeOAuthToken(tokens)
        .then(() => {
          return res.status(200).send('App successfully configured with new Credentials. '
            + 'You can now close this page.');
        });
  });
});