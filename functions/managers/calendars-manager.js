const { google } = require('googleapis');
const CONSTANTS = require('../config/constants');

/**
 * this class is used to manage the following task
 * - create/update calendar event + add/remove attendee
 * - get google calendar details
 * - oauth for accessing google calendar api
 */
class CalendarsManager {
  constructor(oauthClient, dbManager) {
    this._oauthClient = oauthClient;
    this._dbManager = dbManager;
    this._oauthTokens = null;
    this._calendar = null;
  }

  /**
   * this method is used to add an attendees to the respective event id
   *
   * @param {Object} event           - event object
   * @param {Object} user            - user object
   * @param {String} calendarEventId - existing google calendar event id
   *
   * @return {Promise}
   */
  setCalendar(event, user, calendarEventId) {
    return new Promise((resolve, reject) => {
      this._init()
        .then((res) => {
          console.log('calendar event id: ' + calendarEventId);
          // get calendar details based on calendar event id
          return this._getCalendarEvent(calendarEventId);
        })
        .then((calendarDetails) => {
          // if there is calendar details and attendees props is not null, use it as base attendees values
          let attendees = calendarDetails && calendarDetails.attendees ? [...calendarDetails.attendees] : [];

          attendees.push({
            'email': user.email
          });

          // construct google calendar parameters
          const calendarEvent = this._constructCalendarEventParameters(event, attendees);

          console.log('event calendar result');
          console.log(calendarDetails);

          return !calendarDetails ? this._createCalendarEvent(calendarEvent) : this._updateCalendarEvent(calendarEvent, calendarEventId);
        })
        .then((res) => {
          resolve(res);
          return res;
        })
        .catch((err) => {
          console.log('problem in setting calendar');
          console.log(err);
          reject(err);
        });
    });
  }

  /**
   * this method is used to remove an attendee from google calendar event
   * @param {Object} event           - event object
   * @param {Object} user            - user object
   * @param {Object} calendarEventId - google calendar event id
   *
   * @return {Promise}
   */
  removeCalendar(event, user, calendarEventId) {
    return new Promise((resolve, reject) => {
      this._init()
        .then((res) => {
          if (!calendarEventId) {
            reject(new Error('invalid calendar id'));
            return;
          }
          console.log('calendar event id: ' + calendarEventId);
          // get calendar details
          return this._getCalendarEvent(calendarEventId);
        })
        .then((calendarDetails) => {
          if (!calendarDetails) {
            reject(new Error('invalid calendar id'));
            return;
          }

          // grab event calendar attendees list
          let attendees = calendarDetails && calendarDetails.attendees ? [...calendarDetails.attendees] : [];

          console.log('attendees before removing');
          console.log(attendees);

          // if for some reason there is no attendees list, skip the following
          // removal task
          if (attendees.length) {
            const attendeeIndex = attendees.indexOf(user.email);

            attendees.splice(attendeeIndex, 1);
          }

          console.log('attendees after removing');
          console.log(attendees);

          // construct google calendar parameters
          const calendarEvent = this._constructCalendarEventParameters(event, attendees);

          console.log('event calendar result');
          console.log(calendarDetails);

          return this._updateCalendarEvent(calendarEvent, calendarEventId);
        })
        .then((res) => {
          resolve(res);
          return res;
        })
        .catch((err) => {
          console.log('problem in setting calendar');
          console.log(err);
          reject(err);
        });
    });
  }


  /**
   * this method is used to initialise authentication token for google calendar api
   */
  _init() {
    return new Promise((resolve, reject) => {
      if (this._oauthTokens) {
        this._oauthClient.setCredentials(this._oauthTokens);

        this._calendar = google.calendar({version: 'v3', auth: this._oauthClient});
        resolve();
      } else {
        this._dbManager.getOAuthToken()
          .then((tokens) => {
            this._oauthTokens = tokens;
            this._oauthClient.setCredentials(this._oauthTokens);

            this._calendar = google.calendar({version: 'v3', auth: this._oauthClient});

            console.log('Calendar Manager initialised');
            console.log(this._oauthClient);
            console.log(this._oauthTokens);
            console.log(this._calendar);
            resolve();
            return tokens;
          })
          .catch((error) => {
            console.log('problem in initiating calendar manager');
            console.log(error);
            reject(error);
          });
      }
    });
  }

  /**
   * this method is used to call google calendar api - create event
   * @param {Object} calendarEvent - google calendar event object
   *
   * @return {Promise}
   */
  _createCalendarEvent(calendarEvent) {
    console.log('creating new calendar');
    return new Promise((resolve, reject) => {
      this._calendar.events.insert({
        calendarId: 'primary',
        resource: calendarEvent,
      }, (err, event) => {
        if (err) {
          console.log(event)
          console.log('There was an error contacting the Calendar service: ' + err);
          reject(err);
          return;
        }

        resolve(event.data);
      });
    });
  }

  /**
   * this method is used to call google calendar api - patch event
   * @param {Object} calendarEvent   - google calendar event object
   * @param {String} calendarEventId - calendar event id
   *
   * @return {Promise}
   */
  _updateCalendarEvent(calendarEvent, calendarEventId) {
    console.log('updating calendar event');
    return new Promise((resolve, reject) => {
      if (!calendarEventId) {
        reject(new Error('invalid calendar event id'));
        return;
      }

      this._calendar.events.patch({
        calendarId: 'primary',
        eventId: calendarEventId,
        resource: calendarEvent,
      }, (err, event) => {
        if (err) {
          console.log(event)
          console.log('There was an error contacting the Calendar service: ' + err);
          reject(err);
          return;
        }

        console.log('calendar patched');
        console.log(event.data);

        resolve(event.data);
      });
    });
  }

  /**
   * this method is used to construct google calendar object parameters
   * to be used when calling google calendar api - create/patch api
   * @param {Object} event    - event object
   * @param {Array} attendees - Object array, list of attendees emails
   * @param {String} timeZone - timezone code i.e. 'Asia/Singapore'
   * @param {String} timeDiff - timediff i.e. +08:00
   */
  _constructCalendarEventParameters(event, attendees, timeZone = CONSTANTS.TIMEZONE, timeDiff = CONSTANTS.TIMEDIFF) {
    const calendarEvent = {
      'summary': event.name,
      'location': event.location,
      'description': event.description,
      'start': {
        'dateTime': `${event.start_datetime.replace(' ', 'T')}${timeDiff}`,
        'timeZone': timeZone,
      },
      'end': {
        'dateTime': `${event.end_datetime.replace(' ', 'T')}${timeDiff}`,
        'timeZone': timeZone,
      },
      'attendees': attendees,
      'reminders': {
        'useDefault': false,
        'overrides': [
          {'method': 'popup', 'minutes': 60},
          {'method': 'email', 'minutes': 60},
          {'method': 'sms', 'minutes': 60}
        ],
      },
    };

    return calendarEvent;
  }

  /**
   * this method is used to get google calendar event details based on calendar event id
   * @param {String} event_id - google calendar event id
   *
   * @return {Object} - google calendar details object
   */
  _getCalendarEvent(event_id) {
    return new Promise((resolve, reject) => {
      if (!event_id) {
        resolve(null);
        return;
      }

      this._calendar.events.get({
        calendarId: 'primary',
        eventId: event_id
      }, (err, res) => {
        if (err) {
          resolve(null);
          return;
        }

        resolve(res.data);
      });
    });
  }
}

module.exports = CalendarsManager;