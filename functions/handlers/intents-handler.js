const {
  SignIn,
  SimpleResponse
} = require('actions-on-google');
const moment = require('moment-timezone');

const INTENT_CONSTANTS = require('../config/intent-constants');
const CONSTANTS = require('../config/constants');
const {
  getUserIdFromPayload,
  getUserDetailsFromPayload,
  getCleanedEmailId,
  textToSpeech,
  getGreetingTime
} = require('../etc/utils');

const NEXT_ITEM_TYPE = {
  ANNOUNCEMENTS: 'ANNOUNCEMENTS',
  EVENTS: 'EVENTS',
  SCHEDULES: 'SCHEDULES',
  SCHEDULES_OVERVIEW: 'SCHEDULES_OVERVIEW',
  CANCEL_SCHEDULE: 'CANCEL_SCHEDULE',
  DETAILED_SCHEDULE: 'DETAILED_SCHEDULE',
  NO_SCHEDULE: 'NO_SCHEDULE'
};

const _ask = (conv, input, speech = true) => {
  conv.data.last_prompt = input;

  let temp = input;

  if (speech) {
    temp = new SimpleResponse({
      text: input.displayText,
      speech: textToSpeech(input.speech)
    });
  }

  conv.ask(temp);
};

// common method to generate simple response object from the conv.incoming
const _getIncomingResponse = (conv) => {
  const textResponse = conv.incoming.get('string');
  const simpleResponse = conv.incoming.get(SimpleResponse);

  let speech = textResponse;
  let displayText = textResponse;

  const regex = /(?<=<speak>)[\s\S]*(?=<\/speak>)/; // eslint-disable-line

  if (simpleResponse) {
    displayText = simpleResponse.displayText;

    const found = simpleResponse.textToSpeech.match(regex);
    speech = found ? found[0] : displayText;
  }

  // check if there is any prefix conversation need to be added
  const prefixIncoming = conv.data.intent_prefix_content;

  // if there is prefix, append it to the current conversation response
  if (prefixIncoming) {
    speech = `${prefixIncoming.speech}<break time="0.5"/> ${speech}`;

    displayText = `${prefixIncoming.displayText}. ${displayText}`;
  }

  // reset back prefix cache once it's applied
  conv.data.intent_prefix_content = null;

  return {
    speech,
    displayText
  };
};

// TODO: refactor this
// this is with the assumptions that there is only one optionals template
const _getListOptionalsResponse = (string, isGrabText = true, symbol = '[]') => {
  const contentRegex = /(?<=\[)[\s\S]*(?=\])/;
  const contentTemplateRegex = /\[[\s\S]*\]/;

  const contentFound = string.match(contentRegex);
  const content = contentFound ? contentFound[0] : string;

  return isGrabText ? string.replace(contentTemplateRegex, content) : string.replace(contentTemplateRegex, '');
};

const _getLocale = (conv) => {
  return conv.user.locale === 'ja-JP' ? 'ja' : 'en';
};

// this is the common repeat intent handler
const repeatIntentHandler = (conv, params, registered, managers) => {
  const incoming = _getIncomingResponse(conv);

  // grab previous response data from cache
  const temp = new SimpleResponse({
    text: `${incoming.displayText} ${conv.data.last_prompt.displayText}`,
    speech: textToSpeech(`${incoming.speech} <break time="0.5"/> ${conv.data.last_prompt.speech}`)
  });
  conv.ask(temp);
};

// welcome intent handler
const defaultWelcomeHandler = (conv, params, registered, managers) => {
  console.log('welcome intent handler');

  // reset all cached data
  conv.data.events_list = null;
  conv.data.schedules_list = null;
  conv.data.event_details = null;
  conv.data.schedule_details = null;
  conv.data.is_event_details = true;
  conv.data.is_schedule_details = true;
  conv.data.intent_prefix_content = null;
  conv.data.next_item_type = null;
  conv.data.login_forward_intent_event = null;
  conv.data.is_from_overview = true;
  conv.data.has_schedule = false;

  // get current response and cache it as prefix content
  conv.data.intent_prefix_content = _getIncomingResponse(conv);

  // follow up to overview intent
  conv.followup(INTENT_CONSTANTS.OVERVIEW_INTENT.event, {});
};

// this is to handle user sign in intent
const signInHandler = (conv, params, registered, managers) => {
  console.log('sign in intent handler');

  _ask(conv, new SignIn(conv.incoming.get('string')), false);
};

// to handle callback from sign in process
const signedInHandler = (conv, params, registered, managers) => {
  console.log('signed in intent handler');

  console.log('REGISTERED STATUS: ', registered.status);

  if (registered.status === 'OK') {
    // if registered status is ok, add user to database
    return new Promise((resolve, reject) => {
      managers.users.addUser(getUserDetailsFromPayload(conv))
        .then((res) => {
          // check forward intent event from cache,
          // if it doesn't exist, follow up to problem intent
          // otherwise followup to the respective intent
          if (!conv.data.login_forward_intent_event) {
            conv.followup(INTENT_CONSTANTS.PROBLEM_INTENT.event, {});
          } else {
            conv.followup(conv.data.login_forward_intent_event, {});
          }
          resolve();
          return res;
        })
        .catch((err) => {
          conv.followup(INTENT_CONSTANTS.PROBLEM_INTENT.event, {});
          reject(err);
          console.log('problem in adding user');
          console.log(err);
        });
    });
  } else {
    conv.followup(INTENT_CONSTANTS.PROBLEM_LOGIN_INTENT.event, {});
  }
};

// this is to get assigned signal id
// to be used by the hardware setup for broadcasting blurts
const signalIdHandler = (conv, params, registered, managers) => {
  const userId = getCleanedEmailId(conv);
  console.log('signal Id intent handler');
  console.log('user id: ', userId);

  // check if user has already signed in,
  // if not tell them to sign in
  if (!userId) {
    console.log('no account');
    conv.data.login_forward_intent_event = INTENT_CONSTANTS.SIGNAL_ID_INTENT.event;
    conv.followup(
      INTENT_CONSTANTS.SIGN_IN_INTENT.event, {}
    );
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    // get user detail
    managers.users.getUser(userId)
      .then((res) => {
        if (!res) {
          conv.followup(INTENT_CONSTANTS.PROBLEM_INTENT.event, {});
          resolve();
          return;
        }

        // assign signal id value to response dialog
        const incoming = _getIncomingResponse(conv);
        incoming.speech = incoming.speech.replace('signal_id', res.signal_id);
        incoming.displayText = incoming.displayText.replace('signal_id', res.signal_id);

        // broadcast signal id
        _ask(conv, incoming);

        resolve();
        return res;
      })
      .catch((err) => {
        conv.followup(INTENT_CONSTANTS.PROBLEM_INTENT.event, {});
        console.log(err);
        reject(err);
      });
  });
};

// notice board overview handler
// to announce the summary of announcements/notice + events/invites
// there is task duplication between overviewHandler and announcementsListHandler
// this is due to, we can't do a 3 consecutive followup intent
const overviewHandler = (conv, params, registered, managers) => {
  const userId = getCleanedEmailId(conv);
  const userDetails = getUserDetailsFromPayload(conv);
  console.log('overview intent handler');
  console.log('user id: ', userId);

  // check if user has already signed in,
  // if not tell them to sign in
  if (!userId) {
    console.log('no account');
    conv.data.login_forward_intent_event = INTENT_CONSTANTS.OVERVIEW_INTENT.event;
    conv.followup(
      INTENT_CONSTANTS.SIGN_IN_INTENT.event, {}
    );
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let totalAnnouncements = 0;
    let totalEvents = 0;
    let validAnnouncements = [];
    let eventsToAttend = [];

    // get current date time
    const currentDateTime = moment().tz(CONSTANTS.TIMEZONE);

    let summary = {};

    // get user details
    managers.users.getUser(userId)
      .then((res) => {
        // grab all details of announcements to notify
        const announcementsToNotify = res[CONSTANTS.DB_FIELDS.announcements_to_notify] || [];

        // grab list of events to notify
        const eventsToNotify = res[CONSTANTS.DB_FIELDS.events_to_notify] || [];

        // grab list of events to attend
        eventsToAttend = res[CONSTANTS.DB_FIELDS.events_to_attend] || [];

        // filter out valid events by cross checking with attending events list
        const validEvents = eventsToNotify.filter((event) => {
          return eventsToAttend.indexOf(event) === -1;
        })

        summary = {
          announcementsToNotify,
          validEvents
        };

        // grab announcements details
        return Promise.all(
          announcementsToNotify.map((announcement) => {
            return managers.announcements.getAnnouncement(announcement);
          })
        );
      })
      .then((announcements) => {
        let announcementsToDelete = [];

        if (announcements && announcements.length) {
          // filter out valid announcements based on start and end date
          validAnnouncements = announcements.filter((announcement) => {
            if (!announcement) {
              return false;
            }
            const announcementStartDate = moment.tz(announcement.start_datetime, CONSTANTS.TIMEZONE);

            const announcementEndDate = moment.tz(announcement.end_datetime, CONSTANTS.TIMEZONE);

            return currentDateTime.isBetween(announcementStartDate, announcementEndDate) === true;
          });

          // grab list of expired annoucements
          const expiredAnnouncements = announcements.filter((announcement) => {
            if (!announcement) {
              return false;
            }

            const announcementEndDate = moment.tz(announcement.end_datetime, CONSTANTS.TIMEZONE);

            return currentDateTime.isAfter(announcementEndDate);
          });

          // get list of expired announcement to be deleted from users
          expiredAnnouncements.forEach((tmp) => {
            announcementsToDelete.push(tmp.id);
          });

          // store total announcements for future use
          totalAnnouncements = validAnnouncements.length;

          // construct announcements list speech
          if (totalAnnouncements > 0) {
            const temps = validAnnouncements.map((tmp) => {
              return tmp.id;
            });
            announcementsToDelete = [...announcementsToDelete, ...temps];
          }
        }

        // let's clear announcements from user collection
        return managers.users.moveAnnouncementsToNotifyToListenedFromUser(announcementsToDelete, userId);
      })
      .then((res) => {
        // next grab events details
        return Promise.all(summary.validEvents.map((event) => {
          return managers.events.getEvent(event);
        }));
      })
      .then((events) => {
        if (events && events.length) {
          // filter out valid events based on start and end date
          const validEvents = events.filter((event) => {
            if (!event) {
              return false;
            }
            const eventStartDate = moment.tz(event.start_datetime, CONSTANTS.TIMEZONE);

            const eventEndDate = moment.tz(event.end_datetime, CONSTANTS.TIMEZONE);

            return currentDateTime.isBefore(eventEndDate) && currentDateTime.isSameOrBefore(eventStartDate);
          });

          totalEvents = validEvents.length;
        }

        // get events to attend details
        return Promise.all(eventsToAttend.map((event) => {
          return managers.events.getEvent(event);
        }));
      })
      .then((schedules) => {
        // check if we have upcoming schedule
        const validSchedules = schedules.filter((schedule) => {
          if (!schedule) {
            return false;
          }

          const scheduleStartDate = moment.tz(schedule.start_datetime, CONSTANTS.TIMEZONE);

          return currentDateTime.isBefore(scheduleStartDate);
        });

        conv.data.has_schedule = validSchedules.length > 0;

        const greetings = getGreetingTime(currentDateTime, _getLocale(conv));

        // construct speech
        const incoming = _getIncomingResponse(conv);
        incoming.speech = incoming.speech.replace('greetings', `${greetings}`);
        incoming.speech = incoming.speech.replace('name', userDetails.name);
        incoming.speech = incoming.speech.replace('announcements_count', totalAnnouncements);
        incoming.speech = incoming.speech.replace('events_count', totalEvents);

        incoming.displayText = incoming.displayText.replace('greetings', `${greetings}`);
        incoming.displayText = incoming.displayText.replace('name', userDetails.name);
        incoming.displayText = incoming.displayText.replace('announcements_count', totalAnnouncements);
        incoming.displayText = incoming.displayText.replace('events_count', totalEvents);

        // construct notice list
        const msgs = [];
        const msgsText = [];
        validAnnouncements.forEach((announcements, i) => {
          const locale = _getLocale(conv);
          let prefix = locale === 'ja' ? 'こちらがお知らせです。 最初に, ' : 'here\'s your notices. First up, ';

          if (i > 0) {
            prefix = locale === 'ja' ? '次に, ' : 'next, ';

            if (i === validAnnouncements.length - 1) {
              prefix = locale === 'ja' ? '最後に, ' : 'lastly, ';
            }
          }

          msgs.push(`${prefix}<break time="0.5"/>${announcements.name}. <break time="0.5"/> ${announcements.description} <break time="0.5"/>`);

          msgsText.push(`${prefix}${announcements.name}.`);
        });

        incoming.speech += msgs.join('');
        incoming.displayText += msgsText.join('');

        conv.data.intent_prefix_content = incoming;

        if (totalEvents) {
          // if there is events/invites to broadcast, forward it to event list intent
          conv.followup(INTENT_CONSTANTS.EVENTS_LIST_INTENT.event, {});
        } else if (totalEvents === 0 && conv.data.has_schedule) {
          // if there is no events/invites to broadcast, but there is schedule to broadcast,
          // forward it to schedule list overview intent
          conv.followup(INTENT_CONSTANTS.SCHEDULES_LIST_OVERVIEW_INTENT.event, {});
        } else {
          // if there is no events/invites and schedules to broadcast,
          // forward it to no overview intent
          conv.followup(INTENT_CONSTANTS.NO_OVERVIEW_INTENT.event, {});
        }

        resolve();
        return schedules;
      })
      .catch((error) => {
        console.log(error);
        conv.followup(INTENT_CONSTANTS.PROBLEM_INTENT.event, {});
        reject(error);
      });
  });
};

// no overview handler
// triggered when user is coming from overview intent
// no events/invites and schedules to broadcast
// this will close the current session
const noOverviewHandler = (conv, params, registered, managers) => {
  console.log('no overview intent handler');
  const userDetails = getUserDetailsFromPayload(conv);
  const incoming = _getIncomingResponse(conv);

  incoming.speech = incoming.speech.replace('name', userDetails.name);
  incoming.displayText = incoming.displayText.replace('name', userDetails.name);

  conv.close(new SimpleResponse({
    text: incoming.displayText,
    speech: textToSpeech(incoming.speech)
  }));
};

// announcements list handler can be triggered separately from the current single streamline
// this will allow user to navigate through the menu items outside of the main streamline
const announcementsListHandler = (conv, params, registered, managers) => {
  const userId = getCleanedEmailId(conv);
  console.log('announcements list intent handler');
  console.log('user id: ', userId);

  // check if user has already signed in,
  // if not tell them to sign in
  if (!userId) {
    console.log('no account');
    conv.data.login_forward_intent_event = INTENT_CONSTANTS.ANNOUNCEMENTS_LIST_INTENT.event;
    conv.followup(
      INTENT_CONSTANTS.SIGN_IN_INTENT.event, {}
    );
    return Promise.resolve();
  }

  // if user triggered set from overview to false
  if (conv.query !== INTENT_CONSTANTS.ANNOUNCEMENTS_LIST_INTENT.event) {
    conv.data.is_from_overview = false;
  }

  return new Promise((resolve, reject) => {
    let totalAnnouncements = 0;
    let validAnnouncements = [];

    conv.data.events_list = null;
    conv.data.schedules_list = null;
    conv.data.event_details = null;
    conv.data.schedule_details = null;
    conv.data.is_event_details = true;
    conv.data.is_schedule_details = true;
    conv.data.next_item_type = NEXT_ITEM_TYPE.ANNOUNCEMENTS;

    // get user details
    managers.users.getUser(userId)
      .then((res) => {
        // grab all details of announcements to notify
        const announcementsToNotify = res[CONSTANTS.DB_FIELDS.announcements_to_notify] || [];
        return Promise.all(
          announcementsToNotify.map((announcement) => {
            return managers.announcements.getAnnouncement(announcement);
          })
        );
      })
      .then((announcements) => {
        // if there is no announcement, abort
        if (!announcements || !announcements.length) {
          return Promise.resolve(null);
        }

        // get current date time
        const currentDateTime = moment().tz(CONSTANTS.TIMEZONE);

        // filter out valid announcements based on start and end date
        validAnnouncements = announcements.filter((announcement) => {
          if (!announcement) {
            return false;
          }
          const announcementStartDate = moment.tz(announcement.start_datetime, CONSTANTS.TIMEZONE);

          const announcementEndDate = moment.tz(announcement.end_datetime, CONSTANTS.TIMEZONE);

          return currentDateTime.isBetween(announcementStartDate, announcementEndDate) === true;
        });

        // sort announcements based on date
        validAnnouncements.sort((announcementA, announcementB) => {
          const announcementAStartDate = moment.tz(announcementA.start_datetime, CONSTANTS.TIMEZONE);

          const announcementBStartDate = moment.tz(announcementB.start_datetime, CONSTANTS.TIMEZONE);

          if (announcementBStartDate.isAfter(announcementAStartDate)) {
            return -1;
          }

          if (announcementAStartDate.isAfter(announcementBStartDate)) {
            return 1;
          }
        });

        // grab list of expired annoucements
        const expiredAnnouncements = announcements.filter((announcement) => {
          if (!announcement) {
            return false;
          }

          const announcementEndDate = moment.tz(announcement.end_datetime, CONSTANTS.TIMEZONE);

          return currentDateTime.isAfter(announcementEndDate);
        });

        // get list of expired announcement to be deleted from users
        let announcementsToDelete = [];

        expiredAnnouncements.forEach((tmp) => {
          announcementsToDelete.push(tmp.id);
        });

        // store total announcements for future use
        totalAnnouncements = validAnnouncements.length;

        // construct announcements list speech
        if (totalAnnouncements > 0) {
          const temps = validAnnouncements.map((tmp) => {
            return tmp.id;
          });
          announcementsToDelete = [...announcementsToDelete, ...temps];
        }

        // let's clear announcements from user collection
        return managers.users.moveAnnouncementsToNotifyToListenedFromUser(announcementsToDelete, userId);
      })
      .then((res) => {
        // if there is no announcements follow up to no announcements
        // otherwise broadcast announcements
        if (!validAnnouncements) {
          conv.followup(INTENT_CONSTANTS.NO_ANNOUNCEMENTS_INTENT.event, {});
          resolve();

          return res;
        }

        if (validAnnouncements) {
          const incoming = _getIncomingResponse(conv);

          // construct notice list
          const msgs = [];
          const msgsText = [];
          validAnnouncements.forEach((announcements, i) => {
            const locale = _getLocale(conv);
            let prefix = locale === 'ja' ? '最初に, ' : 'First up, ';

            if (i > 0) {
              prefix = locale === 'ja' ? '次に, ' : 'next, ';

              if (i === validAnnouncements.length - 1) {
                prefix = locale === 'ja' ? '最後に, ' : 'lastly, ';
              }
            }
            msgs.push(`${prefix}<break time="0.5"/>${announcements.name}. <break time="0.5"/> ${announcements.description} <break time="0.5"/>`);

            msgsText.push(`${prefix}${announcements.name}. `);
          });

          incoming.speech = incoming.speech.replace('notices_list', msgs.join(''));
          incoming.displayText = incoming.displayText.replace('notices_list', msgsText.join(''));

          _ask(conv, incoming);
        }

        resolve();
        return res;
      })
      .catch((error) => {
        console.log(error);
        conv.followup(INTENT_CONSTANTS.PROBLEM_INTENT.event, {});
        reject(error);
      });
  });
};

const noAnnouncementsHandler = (conv, params, registered, managers) => {
  const incoming = _getIncomingResponse(conv);
  _ask(conv, incoming);
};

// this intent can be triggered internally from overview intent or user triggered
// it is important to trace whether the intent is triggered internally or not
// as it will decide which intent to follow up next
const eventsListHandler = (conv, params, registered, managers) => {
  const userId = getCleanedEmailId(conv);
  console.log('events list intent handler');
  console.log('user id: ', userId);

  moment.locale(_getLocale(conv));

  // check if user has already signed in,
  // if not tell them to sign in
  if (!userId) {
    console.log('no account');
    conv.data.login_forward_intent_event = INTENT_CONSTANTS.EVENTS_LIST_INTENT.event;
    conv.followup(
      INTENT_CONSTANTS.SIGN_IN_INTENT.event, {}
    );
    return Promise.resolve();
  }

  // if user triggered set from overview to false
  if (conv.query !== INTENT_CONSTANTS.EVENTS_LIST_INTENT.event) {
    conv.data.is_from_overview = false;
  }

  return new Promise((resolve, reject) => {
    let attendingEvents = null;
    let eventToBroadcast = null;
    let totalEvents = 0;
    let isFreshRequest = true;

    conv.data.schedules_list = null;
    conv.data.announcement_details = null;
    conv.data.schedule_details = null;
    conv.data.next_item_type = NEXT_ITEM_TYPE.EVENTS;
    conv.data.event_details = null;

    // get current date time
    const currentDateTime = moment().tz(CONSTANTS.TIMEZONE);

    // get user details
    managers.users.getUser(userId)
      .then((res) => {
        // store attending events into variable for future reference
        attendingEvents = res[CONSTANTS.DB_FIELDS.events_to_attend] || [];

        // grab all details of events to notify
        // if there is events_list data from the cache, use it
        // otherwise, query database to get events details
        if (!conv.data.events_list) {
          const eventsToNotify = res[CONSTANTS.DB_FIELDS.events_to_notify] || [];
          return Promise.all(
            eventsToNotify.map((event) => {
              return managers.events.getEvent(event);
            })
          );
        } else {
          isFreshRequest = false;
          return Promise.resolve(conv.data.events_list);
        }
      })
      .then((events) => {
        // if there is no events, abort
        if (!events || !events.length) {
          return Promise.resolve(null);
        }

        let validEvents = conv.data.events_list ? [...conv.data.events_list] : [];

        if (!conv.data.events_list || !conv.data.events_list.length) {
          // filter out valid events based on start and end date
          validEvents = events.filter((event) => {
            if (!event) {
              return false;
            }
            const eventStartDate = moment.tz(event.start_datetime, CONSTANTS.TIMEZONE);

            const eventEndDate = moment.tz(event.end_datetime, CONSTANTS.TIMEZONE);

            return currentDateTime.isBefore(eventEndDate) && currentDateTime.isSameOrBefore(eventStartDate) && attendingEvents.indexOf(event.id) === -1;
          });

          // sort events based on date
          validEvents.sort((eventA, eventB) => {
            const eventAStartDate = moment.tz(eventA.start_datetime, CONSTANTS.TIMEZONE);

            const eventBStartDate = moment.tz(eventB.start_datetime, CONSTANTS.TIMEZONE);

            if (eventBStartDate.isAfter(eventAStartDate)) {
              return -1;
            }

            if (eventAStartDate.isAfter(eventBStartDate)) {
              return 1;
            }
          });
        }

        // grab list of expired events
        const expiredEvents = events.filter((event) => {
          if (!event) {
            return false;
          }
          const eventStartDate = moment.tz(event.start_datetime, CONSTANTS.TIMEZONE);

          return currentDateTime.isAfter(eventStartDate) || attendingEvents.indexOf(event.id) !== -1;
        });

        // remove expired events from users
        let eventsToDelete = [];

        expiredEvents.forEach((tmp) => {
          eventsToDelete.push(tmp.id);
        });

        // store total events for future use
        totalEvents = validEvents.length;

        // grab event to broadcast
        if (totalEvents > 0) {
          eventToBroadcast = validEvents[0];

          // store list of events into cache
          validEvents.splice(0, 1);
          conv.data.events_list = [...validEvents];

          // reset is event details status, this is to define which intent to follow up
          // when user said yes/sure/etc
          conv.data.event_details = eventToBroadcast;
          conv.data.is_event_details = true;
        }

        // let's clear events from user collection
        return managers.users.removeEventsToNotifyFromUser(eventsToDelete, userId);
      })
      .then((res) => {
        // get attending events details
        return Promise.all(attendingEvents.map((event) => {
          return managers.events.getEvent(event);
        }));
      })
      .then((events) => {
        // check if we have upcoming schedule
        const schedules = events.filter((schedule) => {
          if (!schedule) {
            return false;
          }

          const scheduleStartDate = moment.tz(schedule.start_datetime, CONSTANTS.TIMEZONE);

          return currentDateTime.isBefore(scheduleStartDate);
        });

        conv.data.has_schedule = schedules.length > 0;

        // if there is no events follow up to no events intent
        // otherwise broadcast event
        if (!eventToBroadcast) {
          // if it's not coming from overview intent, forward it to no events intent
          if (conv.data.is_from_overview) {
            if (conv.data.has_schedule) {
              conv.followup(INTENT_CONSTANTS.SCHEDULES_LIST_OVERVIEW_INTENT.event, {});
            } else {
              conv.followup(INTENT_CONSTANTS.NO_OVERVIEW_INTENT.event, {});
            }
          } else {
            conv.followup(INTENT_CONSTANTS.NO_EVENTS_INTENT.event, {});
          }

          resolve();

          return events;
        }

        const validEvents = conv.data.events_list;

        if (validEvents) {
          if (isFreshRequest) {
            const incoming = _getIncomingResponse(conv);

            const eventStart = moment.tz(eventToBroadcast.start_datetime, CONSTANTS.TIMEZONE).format(CONSTANTS.DATE_FORMAT);

            incoming.speech = incoming.speech.replace('event_name', eventToBroadcast.name);
            incoming.speech = incoming.speech.replace('event_start', eventStart);
            incoming.speech = incoming.speech.replace('events_count', totalEvents);

            incoming.displayText = incoming.displayText.replace('event_name', eventToBroadcast.name);
            incoming.displayText = incoming.displayText.replace('event_start', eventStart);
            incoming.displayText = incoming.displayText.replace('events_count', totalEvents);

            // this is to grab the correct optional response from dialogflow
            // if it's not the last event, show optional response
            incoming.speech = _getListOptionalsResponse(incoming.speech, validEvents.length > 0);
            incoming.displayText = _getListOptionalsResponse(incoming.displayText, validEvents.length > 0);

            _ask(conv, incoming);
          } else {
            // if valid events length is 0, it means that this is the last event to notify
            // forward it to event last intent
            // otherwise, forward it to event middle intent
            if (validEvents.length === 0) {
              conv.followup(INTENT_CONSTANTS.EVENTS_LAST_INTENT.event, {});
            } else {
              conv.followup(INTENT_CONSTANTS.EVENTS_MIDDLE_INTENT.event, {});
            }
          }
        }

        resolve();

        return events;
      })
      .catch((error) => {
        conv.followup(INTENT_CONSTANTS.PROBLEM_INTENT.event, {});
        console.log('problem in events list intent');
        console.log(error);
        reject(error);
      });
  });
};

// this is to handle event list where index > 0 and index < last
// so that we can get a proper response from dialogflow
const eventsMiddleHandler = (conv, params, registered, managers) => {
  console.log('middle event handler');
  const eventToBroadcast = conv.data.event_details;
  if (!eventToBroadcast) {
    conv.followup(INTENT_CONSTANTS.PROBLEM_INTENT.event, {});
    return;
  }

  const incoming = _getIncomingResponse(conv);

  moment.locale(_getLocale(conv));

  const eventStart = moment.tz(eventToBroadcast.start_datetime, CONSTANTS.TIMEZONE).format(CONSTANTS.DATE_FORMAT);

  incoming.speech = incoming.speech.replace('event_name', eventToBroadcast.name);
  incoming.speech = incoming.speech.replace('event_start', eventStart);

  incoming.displayText = incoming.displayText.replace('event_name', eventToBroadcast.name);
  incoming.displayText = incoming.displayText.replace('event_start', eventStart);

  _ask(conv, incoming);
};

// this is for handling last item from the event list to notify
// similar to events middle intent, the purpose of this intent is to get a proper dialog
const eventsLastHandler = (conv, params, registered, managers) => {
  console.log('last event handler');
  const eventToBroadcast = conv.data.event_details;
  if (!eventToBroadcast) {
    conv.followup(INTENT_CONSTANTS.PROBLEM_INTENT.event, {});
    return;
  }

  const incoming = _getIncomingResponse(conv);

  moment.locale(_getLocale(conv));

  const eventStart = moment.tz(eventToBroadcast.start_datetime, CONSTANTS.TIMEZONE).format(CONSTANTS.DATE_FORMAT);

  incoming.speech = incoming.speech.replace('event_name', eventToBroadcast.name);
  incoming.speech = incoming.speech.replace('event_start', eventStart);

  incoming.displayText = incoming.displayText.replace('event_name', eventToBroadcast.name);
  incoming.displayText = incoming.displayText.replace('event_start', eventStart);

  _ask(conv, incoming);
};

// this is to handle event details intent
// triggered when user want to hear more about the event
const eventDetailsHandler = (conv, params, registered, managers) => {
  const userId = getCleanedEmailId(conv);
  console.log('event details intent handler');
  console.log('user id: ', userId);

  const eventToBroadcast = conv.data.event_details;

  if (!eventToBroadcast) {
    conv.followup(INTENT_CONSTANTS.PROBLEM_INTENT.event, {});
    return;
  }

  moment.locale(_getLocale(conv));

  conv.data.is_event_details = false;

  const eventStart = moment.tz(eventToBroadcast.start_datetime, CONSTANTS.TIMEZONE).format(CONSTANTS.DATE_FORMAT);

  const eventEnd = moment.tz(eventToBroadcast.end_datetime, CONSTANTS.TIMEZONE).format(CONSTANTS.DATE_FORMAT);

  const incoming = _getIncomingResponse(conv);
  incoming.speech = incoming.speech.replace('event_name', eventToBroadcast.name);
  incoming.speech = incoming.speech.replace('event_location', eventToBroadcast.location);
  incoming.speech = incoming.speech.replace('event_end', eventEnd);
  incoming.speech = incoming.speech.replace('event_start', eventStart);
  incoming.speech = incoming.speech.replace('event_description', eventToBroadcast.description);

  incoming.displayText = incoming.displayText.replace('event_name', eventToBroadcast.name);
  incoming.displayText = incoming.displayText.replace('event_location', eventToBroadcast.location);
  incoming.displayText = incoming.displayText.replace('event_end', eventEnd);
  incoming.displayText = incoming.displayText.replace('event_start', eventStart);
  incoming.displayText = incoming.displayText.replace('event_description', eventToBroadcast.description);

  _ask(conv, incoming);
};

const noEventsHandler = (conv, params, registered, managers) => {
  console.log('no events handler');
  conv.data.events_list = null;
  const incoming = _getIncomingResponse(conv);
  _ask(conv, incoming);
};

// TODO: change intent name to be more generic
// as this intent is being used across all due to similarity in trigger words
// we didn't make this as followup intent as we don't want to make it closely coupled
// plus, less code. though we need to be very careful in managing the state
// which defines the correct followup intent to be triggered next
const attendEventHandler = (conv, params, registered, managers) => {
  const userId = getCleanedEmailId(conv);
  console.log(`event details intent handler - ${conv.data.next_item_type}`);
  console.log('user id: ', userId);

  // check if user has already signed in,
  // if not tell them to sign in
  if (!userId) {
    console.log('no account');
    conv.data.login_forward_intent_event = INTENT_CONSTANTS.EVENTS_LIST_INTENT.event;
    conv.followup(
      INTENT_CONSTANTS.SIGN_IN_INTENT.event, {}
    );
    return Promise.resolve();
  }

  const user = getUserDetailsFromPayload(conv);
  const eventDetails = conv.data.event_details;
  const scheduleDetails = conv.data.schedule_details;

  // based on next_item_type, we decide the next followup intent
  switch(conv.data.next_item_type) {
    // user might say "yes" to either skip the event details or to attend the event
    case NEXT_ITEM_TYPE.EVENTS:
      // if there is no event details and user object is not valid
      // abort
      if (!eventDetails || !user) {
        conv.followup(INTENT_CONSTANTS.PROBLEM_INTENT.event, {});
        return Promise.resolve();
      }

      // if is_event_details state is true and event details object is valid
      // we assume that user intention is to get the event details
      if (conv.data.is_event_details && eventDetails) {
        conv.followup(INTENT_CONSTANTS.EVENT_DETAILS_INTENT.event, {});
        return Promise.resolve();
      }

      // if is_event_details state is false and event details object is valid
      // we assume that user intention is to attend the event
      if (!conv.data.is_event_details && eventDetails) {
        return new Promise((resolve, reject) => {
          let calendarEventId = null;

          // get calendar id for the respective event
          managers.events_attendance.getAttendance(eventDetails.id)
            .then((eventAttendance) => {
              if (eventAttendance) {
                calendarEventId = eventAttendance.calendar_event_id;
              }

              // get set calendar
              return managers.calendars.setCalendar(eventDetails, user, calendarEventId)
            })
            .then((res) => {
              // update our attendance record with calendar event id
              const calendarEventId = res.id;

              // add event to attend list
              return managers.events_attendance.addAttendance(userId, eventDetails.id, calendarEventId);
            })
            .then((res) => {
              // save events to attend event list
              return managers.users.attendEvent(eventDetails.id, userId);
            })
            .then((res) => {
              // remove events to notify from user
              return managers.users.removeEventsToNotifyFromUser([eventDetails.id], userId);
            })
            .then((res) => {
              conv.data.intent_prefix_content = _getIncomingResponse(conv);

              // forward event to event list intent
              conv.followup(INTENT_CONSTANTS.EVENTS_LIST_INTENT.event, {});
              resolve();
              return res;
            })
            .catch((error) => {
              conv.followup(INTENT_CONSTANTS.PROBLEM_INTENT.event, {});
              reject(error);
            });
        });
      }
      break;
    case NEXT_ITEM_TYPE.CANCEL_SCHEDULE:
      // if there is no valid schedule details and user object
      // abort
      if (!scheduleDetails || !user) {
        conv.followup(INTENT_CONSTANTS.PROBLEM_INTENT.event, {});
        return Promise.resolve();
      }

      console.error('HERE HERE HERE');

      // if schedule details is valid, proceed to cancel schedule confirmed intent
      if (scheduleDetails) {
        conv.followup(INTENT_CONSTANTS.CANCEL_SCHEDULE_CONFIRMED_INTENT.event, {});
      }
      break;
    case NEXT_ITEM_TYPE.SCHEDULES_OVERVIEW:
      // if user is coming from schedules overview intent,
      // we assume that user is saying "yes" to listen to the list of schedules
      conv.followup(INTENT_CONSTANTS.SCHEDULES_LIST_INTENT.event, {});
      break;
    case NEXT_ITEM_TYPE.DETAILED_SCHEDULE:
      if (conv.data.is_schedule_details && scheduleDetails) {
        conv.followup(INTENT_CONSTANTS.SCHEDULE_DETAILS_INTENT.event, {});
        return Promise.resolve();
      }

      if (!conv.data.is_schedule_details && scheduleDetails) {
        conv.followup(INTENT_CONSTANTS.SCHEDULES_LIST_INTENT.event, {});
      }
      break;
    case NEXT_ITEM_TYPE.SCHEDULES:
      if (!scheduleDetails || !user) {
        conv.followup(INTENT_CONSTANTS.PROBLEM_INTENT.event, {});
        return Promise.resolve();
      }

      if (conv.data.is_schedule_details && scheduleDetails) {
        conv.followup(INTENT_CONSTANTS.SCHEDULE_DETAILS_INTENT.event, {});
        return Promise.resolve();
      }

      if (!conv.data.is_schedule_details && scheduleDetails) {
        conv.followup(INTENT_CONSTANTS.SCHEDULES_LIST_INTENT.event, {});
      }
      break;
    default:
      conv.followup(INTENT_CONSTANTS.DEFAULT_FALLBACK_INTENT.event, {});
      break;
  }
};

const eventSkipHandler = (conv, params, registered, managers) => {
  const userId = getCleanedEmailId(conv);
  console.log('event skip intent handler');
  console.log('user id: ', userId);
  console.log('next item type: ', conv.data.next_item_type);

  // check if user has already signed in,
  // if not tell them to sign in
  if (!userId) {
    console.log('no account');
    conv.data.login_forward_intent_event = INTENT_CONSTANTS.EVENTS_LIST_INTENT.event;
    conv.followup(
      INTENT_CONSTANTS.SIGN_IN_INTENT.event, {}
    );
    return Promise.resolve();
  }

  const cachedEventsList = conv.data.events_list;

  switch(conv.data.next_item_type) {
    case NEXT_ITEM_TYPE.ANNOUNCEMENTS:
      conv.followup(INTENT_CONSTANTS.ANNOUNCEMENTS_LIST_INTENT.event, {});
      break;
    case NEXT_ITEM_TYPE.EVENTS:
      conv.data.intent_prefix_content = _getIncomingResponse(conv);

      if (!conv.data.events_list.length) {
        conv.data.intent_prefix_content = null;
      }

      if (cachedEventsList) {
        if (cachedEventsList.length === 0) {
          if (conv.data.is_from_overview) {
            // if it's coming from overview intent and has no scheduled events
            // forward it to schedule list overview intent
            // otherwise, forward it no overview intent
            if (!conv.data.has_schedule) {
              conv.followup(INTENT_CONSTANTS.NO_OVERVIEW_INTENT.event, {});
            } else {
              conv.followup(INTENT_CONSTANTS.SCHEDULES_LIST_OVERVIEW_INTENT.event, {});
            }
          } else {
            // if it's not coming from overview intent, forward it to no events intent
            conv.followup(INTENT_CONSTANTS.NO_EVENTS_INTENT.event, {});
          }
        } else {
          conv.followup(INTENT_CONSTANTS.EVENTS_LIST_INTENT.event, {});
        }
      }
      break;
    case NEXT_ITEM_TYPE.SCHEDULES_OVERVIEW:
      conv.followup(INTENT_CONSTANTS.NO_OVERVIEW_INTENT.event, {});
      break;
    case NEXT_ITEM_TYPE.CANCEL_SCHEDULE:
      conv.followup(INTENT_CONSTANTS.CANCEL_SCHEDULE_DECLINED_INTENT.event, {});
      break;
    case NEXT_ITEM_TYPE.SCHEDULES:
      if (conv.data.schedules_list.length > 0) {
        conv.followup(INTENT_CONSTANTS.SCHEDULES_LIST_INTENT.event, {});
      } else {
        if (conv.data.is_from_overview) {
          conv.followup(INTENT_CONSTANTS.NO_OVERVIEW_INTENT.event, {});
        } else {
          conv.followup(INTENT_CONSTANTS.NO_SCHEDULES_INTENT.event, {});
        }
      }
      break;
    case NEXT_ITEM_TYPE.DETAILED_SCHEDULE:
      if (conv.data.schedules_list.length > 0) {
        conv.followup(INTENT_CONSTANTS.SCHEDULES_LIST_INTENT.event, {});
      } else {
        if (conv.data.is_from_overview) {
          conv.followup(INTENT_CONSTANTS.NO_OVERVIEW_INTENT.event, {});
        } else {
          conv.followup(INTENT_CONSTANTS.NO_SCHEDULES_INTENT.event, {});
        }
      }
      break;
    default:
      conv.followup(INTENT_CONSTANTS.DEFAULT_FALLBACK_INTENT.event, {});
      break;
  }
};

const declineEventHandler = (conv, params, registered, managers) => {
  const userId = getCleanedEmailId(conv);
  console.log('event skip intent handler');
  console.log('user id: ', userId);

  // check if user has already signed in,
  // if not tell them to sign in
  if (!userId) {
    console.log('no account');
    conv.data.login_forward_intent_event = INTENT_CONSTANTS.EVENTS_LIST_INTENT.event;
    conv.followup(
      INTENT_CONSTANTS.SIGN_IN_INTENT.event, {}
    );
    return Promise.resolve();
  }

  const cachedEventsList = conv.data.events_list;

  switch(conv.data.next_item_type) {
    case NEXT_ITEM_TYPE.EVENTS:
      conv.data.intent_prefix_content = _getIncomingResponse(conv);
      if (cachedEventsList) {
        if (cachedEventsList.length === 0) {
          if (conv.data.is_from_overview) {
            // if it's coming from overview intent and has no scheduled events
            // forward it to schedule list overview intent
            // otherwise, forward it no overview intent
            if (!conv.data.has_schedule) {
              conv.followup(INTENT_CONSTANTS.NO_OVERVIEW_INTENT.event, {});
            } else {
              conv.followup(INTENT_CONSTANTS.SCHEDULES_LIST_OVERVIEW_INTENT.event, {});
            }
          } else {
            // if it's not coming from overview intent, forward it to no events intent
            conv.followup(INTENT_CONSTANTS.NO_EVENTS_INTENT.event, {});
          }
        } else {
          conv.followup(INTENT_CONSTANTS.EVENTS_LIST_INTENT.event, {});
        }
      }
      break;
    case NEXT_ITEM_TYPE.CANCEL_SCHEDULE:
      conv.followup(INTENT_CONSTANTS.CANCEL_SCHEDULE_DECLINED_INTENT.event, {});
      break;
    case NEXT_ITEM_TYPE.SCHEDULES_OVERVIEW:
      conv.followup(INTENT_CONSTANTS.NO_OVERVIEW_INTENT.event, {});
      break;
    default:
      conv.followup(INTENT_CONSTANTS.DEFAULT_CANCEL_INTENT.event, {});
      break;
  }
};

const cancelScheduleHandler = (conv, params, registered, managers) => {
  const userId = getCleanedEmailId(conv);
  console.log('event details intent handler');
  console.log('user id: ', userId);

  // check if user has already signed in,
  // if not tell them to sign in
  if (!userId) {
    console.log('no account');
    conv.data.login_forward_intent_event = INTENT_CONSTANTS.EVENTS_LIST_INTENT.event;
    conv.followup(
      INTENT_CONSTANTS.SIGN_IN_INTENT.event, {}
    );
    return Promise.resolve();
  }

  const scheduleToBroadcast = conv.data.schedule_details;

  if (!scheduleToBroadcast) {
    conv.followup(INTENT_CONSTANTS.PROBLEM_INTENT.event, {});
    return;
  }

  conv.data.next_item_type = NEXT_ITEM_TYPE.CANCEL_SCHEDULE;

  _ask(conv, _getIncomingResponse(conv));
};

const cancelScheduleDeclinedHandler = (conv, params, registered, managers) => {
  const incoming = _getIncomingResponse(conv);
  conv.data.intent_prefix_content = incoming;

  conv.data.schedule_details = null;

  const validEvents = conv.data.schedules_list ? [...conv.data.schedules_list] : [];

  // grab the next schedule details
  conv.data.schedule_details = validEvents.length ? validEvents[0] : null;

  // remove broadcasted schedule
  validEvents.splice(0, 1);

  // store latest list into cache
  conv.data.schedules_list = [...validEvents];// store list of events into cache

  // we can't forward it to schedule list where all the following logic took place
  // cause the max hop we can have is just 3 hops
  console.log('total SCHEDULE: ', conv.data.schedules_list.length);
  if (conv.data.schedules_list.length >= 1) {
    conv.followup(INTENT_CONSTANTS.SCHEDULES_MIDDLE_INTENT.event, {});
  } else if (conv.data.schedules_list.length === 0 && conv.data.schedule_details) {
    conv.followup(INTENT_CONSTANTS.SCHEDULES_LAST_INTENT.event, {});
  } else {
    conv.followup(INTENT_CONSTANTS.NO_SCHEDULES_INTENT.event, {});
  }
};

const cancelScheduleConfirmedHandler = (conv, params, registered, managers) => {
  return new Promise((resolve, reject) => {
    let calendarEventId = null;
    const scheduleDetails = conv.data.schedule_details;
    const user = getUserDetailsFromPayload(conv);
    const userId = getCleanedEmailId(conv);

    console.log('CANCEL SCHEDULE CONFIRMED');

    managers.events_attendance.getAttendance(scheduleDetails.id)
      .then((eventAttendance) => {
        if (eventAttendance) {
          calendarEventId = eventAttendance.calendar_event_id;
        }

        // remove user from calendar attendance
        return managers.calendars.removeCalendar(scheduleDetails, user, calendarEventId)
      })
      .then((res) => {
        // remove event from attended events list
        return managers.users.cleanAttendedEvents([scheduleDetails.id], userId);
      })
      .then((res) => {
        // add event back to notify list
        return managers.users.broadcastEventsToUser([scheduleDetails.id], userId);
      })
      .then((res) => {
        const incoming = _getIncomingResponse(conv);
        conv.data.intent_prefix_content = incoming;
        conv.data.schedule_details = null;

        const validEvents = conv.data.schedules_list ? [...conv.data.schedules_list] : [];

        // grab the next schedule details
        conv.data.schedule_details = validEvents.length ? validEvents[0] : null;

        // remove broadcasted schedule
        validEvents.splice(0, 1);

        // store latest list into cache
        conv.data.schedules_list = [...validEvents];// store list of events into cache

        // we can't forward it to schedule list where all the following logic took place
        // cause the max hop we can have is just 3 hops
        console.log('total SCHEDULE: ', conv.data.schedules_list.length);
        if (conv.data.schedules_list.length >= 1) {
          conv.followup(INTENT_CONSTANTS.SCHEDULES_MIDDLE_INTENT.event, {});
        } else if (conv.data.schedules_list.length === 0 && conv.data.schedule_details) {
          conv.followup(INTENT_CONSTANTS.SCHEDULES_LAST_INTENT.event, {});
        } else {
          conv.followup(INTENT_CONSTANTS.NO_SCHEDULES_INTENT.event, {});
        }
        resolve();
        return res;
      })
      .catch((err) => {
        console.log('problem in removing calendar');
        console.log(err);
        reject(err);
      });
  });
};

const scheduleDetailsHandler = (conv, params, registered, managers) => {
  const userId = getCleanedEmailId(conv);
  console.log('schedule details intent handler');
  console.log('user id: ', userId);

  const scheduleToBroadcast = conv.data.schedule_details;

  if (!scheduleToBroadcast) {
    conv.followup(INTENT_CONSTANTS.PROBLEM_INTENT.event, {});
    return;
  }

  moment.locale(_getLocale(conv));

  conv.data.next_item_type = NEXT_ITEM_TYPE.DETAILED_SCHEDULE;
  conv.data.is_schedule_details = false;
  const validSchedules = conv.data.schedules_list;

  const scheduleStart = moment.tz(scheduleToBroadcast.start_datetime, CONSTANTS.TIMEZONE).format(CONSTANTS.DATE_FORMAT);

  const incoming = _getIncomingResponse(conv);
  incoming.speech = incoming.speech.replace('event_name', scheduleToBroadcast.name);
  incoming.speech = incoming.speech.replace('event_location', scheduleToBroadcast.location);
  incoming.speech = incoming.speech.replace('event_start', scheduleStart);
  incoming.speech = incoming.speech.replace('event_description', scheduleToBroadcast.description);

  incoming.displayText = incoming.displayText.replace('event_name', scheduleToBroadcast.name);
  incoming.displayText = incoming.displayText.replace('event_location', scheduleToBroadcast.location);
  incoming.displayText = incoming.displayText.replace('event_start', scheduleStart);
  incoming.displayText = incoming.displayText.replace('event_description', scheduleToBroadcast.description);

  incoming.speech = _getListOptionalsResponse(incoming.speech, validSchedules.length > 0);
  incoming.displayText = _getListOptionalsResponse(incoming.displayText, validSchedules.length > 0);

  _ask(conv, incoming);
};

const schedulesListOverviewHandler = (conv, params, registered, managers) => {
  const userId = getCleanedEmailId(conv);
  console.log('schedules list intent handler');
  console.log('user id: ', userId);

  // check if user has already signed in,
  // if not tell them to sign in
  if (!userId) {
    console.log('no account');
    conv.data.login_forward_intent_event = INTENT_CONSTANTS.SCHEDULES_LIST_INTENT.event;
    conv.followup(
      INTENT_CONSTANTS.SIGN_IN_INTENT.event, {}
    );
    return Promise.resolve();
  }

  // if user triggered set from overview to false
  if (conv.query !== INTENT_CONSTANTS.SCHEDULES_LIST_OVERVIEW_INTENT.event) {
    conv.data.is_from_overview = false;
  }

  return new Promise((resolve, reject) => {
    let totalSchedules = 0;
    let eventsToAttend = null;

    conv.data.events_list = null;
    conv.data.event_details = null;
    conv.data.is_event_details = true;
    conv.data.is_schedule_details = true;
    conv.data.schedule_details = null;
    conv.data.next_item_type = NEXT_ITEM_TYPE.SCHEDULES_OVERVIEW;

    // get user details
    managers.users.getUser(userId)
      .then((res) => {
        // grab all details of events to attend
        eventsToAttend = res[CONSTANTS.DB_FIELDS.events_to_attend] || [];

        return Promise.all(
          eventsToAttend.map((event) => {
            return managers.events.getEvent(event);
          })
        );
      })
      .then((events) => {
        // if there is no events, abort
        if (!events || !events.length) {
          return Promise.resolve(null);
        }

        // get current date time
        const currentDateTime = moment().tz(CONSTANTS.TIMEZONE);

        let validEvents = conv.data.schedules_list ? [...conv.data.schedules_list] : [];

        // filter out valid events based on start and end date
        validEvents = events.filter((event) => {
          if (!event) {
            return false;
          }
          const eventStartDate = moment.tz(event.start_datetime, CONSTANTS.TIMEZONE);

          return currentDateTime.isSameOrBefore(eventStartDate);
        });

        // sort events based on date
        validEvents.sort((eventA, eventB) => {
          const eventAStartDate = moment.tz(eventA.start_datetime, CONSTANTS.TIMEZONE);

          const eventBStartDate = moment.tz(eventB.start_datetime, CONSTANTS.TIMEZONE);

          if (eventBStartDate.isAfter(eventAStartDate)) {
            return -1;
          }

          if (eventAStartDate.isAfter(eventBStartDate)) {
            return 1;
          }
        });

        // store total events for future use
        totalSchedules = validEvents.length;
        // if there is no schedules follow up to no schedules intent
        // otherwise broadcast schedules
        if (!totalSchedules) {
          conv.followup(INTENT_CONSTANTS.NO_OVERVIEW_INTENT.event, {});
        } else {
          const incoming = _getIncomingResponse(conv);
          incoming.speech = incoming.speech.replace('total_schedules', totalSchedules);
          incoming.displayText = incoming.displayText.replace('total_schedules', totalSchedules);

          _ask(conv, incoming);
        }

        resolve();

        return events;
      })
      .catch((error) => {
        conv.followup(INTENT_CONSTANTS.PROBLEM_INTENT.event, {});
        reject(error);
      });
  });
};

const schedulesListHandler = (conv, params, registered, managers) => {
  const userId = getCleanedEmailId(conv);
  console.log('schedules list intent handler');
  console.log('user id: ', userId);

  moment.locale(_getLocale(conv));

  // check if user has already signed in,
  // if not tell them to sign in
  if (!userId) {
    console.log('no account');
    conv.data.login_forward_intent_event = INTENT_CONSTANTS.SCHEDULES_LIST_INTENT.event;
    conv.followup(
      INTENT_CONSTANTS.SIGN_IN_INTENT.event, {}
    );
    return Promise.resolve();
  }

  // if user triggered set from overview to false
  if (conv.query !== INTENT_CONSTANTS.SCHEDULES_LIST_INTENT.event) {
    conv.data.is_from_overview = false;
  }

  return new Promise((resolve, reject) => {
    let totalSchedules = 0;
    let scheduleToBroadcast = null;
    let isFreshRequest = true;

    conv.data.events_list = null;
    conv.data.event_details = null;
    conv.data.is_event_details = true;
    conv.data.schedule_details = null;
    conv.data.is_schedule_details = true;
    conv.data.next_item_type = NEXT_ITEM_TYPE.SCHEDULES;

    // get user details
    managers.users.getUser(userId)
      .then((res) => {
        // grab all details of events to attend
        if (!conv.data.schedules_list) {
          eventsToAttend = res[CONSTANTS.DB_FIELDS.events_to_attend] || [];

          return Promise.all(
            eventsToAttend.map((event) => {
              return managers.events.getEvent(event);
            })
          );
        } else {
          isFreshRequest = false;
          console.log('not a fresh request');
          return Promise.resolve(conv.data.schedules_list);
        }
      })
      .then((events) => {
        // if there is no events, abort
        if (!events || !events.length) {
          return Promise.resolve(null);
        }

        // get current date time
        const currentDateTime = moment().tz(CONSTANTS.TIMEZONE);

        let validEvents = conv.data.schedules_list ? [...conv.data.schedules_list] : [];

        // filter out valid events based on start and end date
        if (!conv.data.schedules_list || !conv.data.schedules_list.length) {
          validEvents = events.filter((event) => {
            if (!event) {
              return false;
            }
            const eventStartDate = moment.tz(event.start_datetime, CONSTANTS.TIMEZONE);

            return currentDateTime.isSameOrBefore(eventStartDate);
          });

          // sort events based on date
          validEvents.sort((eventA, eventB) => {
            const eventAStartDate = moment.tz(eventA.start_datetime, CONSTANTS.TIMEZONE);

            const eventBStartDate = moment.tz(eventB.start_datetime, CONSTANTS.TIMEZONE);

            if (eventBStartDate.isAfter(eventAStartDate)) {
              return -1;
            }

            if (eventAStartDate.isAfter(eventBStartDate)) {
              return 1;
            }
          });
        }

        // grab list of expired attended events
        const expiredEvents = events.filter((event) => {
          if (!event) {
            return false;
          }

          const eventStartDate = moment.tz(event.start_datetime, CONSTANTS.TIMEZONE);

          return currentDateTime.isAfter(eventStartDate);
        });

        // get list of expired attended events to be deleted from users,
        // this includes expired attended events
        let eventsToDelete = [];

        expiredEvents.forEach((tmp) => {
          eventsToDelete.push(tmp.id);
        });

        // store total events for future use
        totalSchedules = validEvents.length;

        // construct events list speech
        if (totalSchedules > 0) {
          scheduleToBroadcast = validEvents[0];

          // store list of events into cache
          validEvents.splice(0, 1);
          conv.data.schedules_list = [...validEvents];

          // reset is annoucements details status, this is to define which intent to follow up
          // when user said next
          conv.data.schedule_details = scheduleToBroadcast;
        }

        // let's clear events from user collection
        return managers.users.cleanAttendedEvents(eventsToDelete, userId);
      })
      .then((res) => {
        // if there is no schedules follow up to no schedules intent
        // otherwise broadcast schedules
        if (!scheduleToBroadcast) {
          if (conv.data.is_from_overview) {
            conv.followup(INTENT_CONSTANTS.NO_OVERVIEW_INTENT.event, {});
          } else {
            conv.followup(INTENT_CONSTANTS.NO_SCHEDULES_INTENT.event, {});
          }
          resolve();

          return res;
        }

        const validSchedules = conv.data.schedules_list;

        if (validSchedules) {
          if (isFreshRequest) {
            const eventStart = moment.tz(scheduleToBroadcast.start_datetime, CONSTANTS.TIMEZONE).format(CONSTANTS.DATE_FORMAT);

            const incoming = _getIncomingResponse(conv);
            incoming.speech = incoming.speech.replace('schedule_name', scheduleToBroadcast.name);
            incoming.speech = incoming.speech.replace('schedule_location', scheduleToBroadcast.location);
            incoming.speech = incoming.speech.replace('schedule_start', eventStart);
            incoming.speech = incoming.speech.replace('schedules_count', totalSchedules);

            incoming.displayText = incoming.displayText.replace('schedule_name', scheduleToBroadcast.name);
            incoming.displayText = incoming.displayText.replace('schedule_location', scheduleToBroadcast.location);
            incoming.displayText = incoming.displayText.replace('schedule_start', eventStart);
            incoming.displayText = incoming.displayText.replace('schedules_count', totalSchedules);

            incoming.speech = _getListOptionalsResponse(incoming.speech, validSchedules.length > 0);
            incoming.displayText = _getListOptionalsResponse(incoming.displayText, validSchedules.length > 0);

            _ask(conv, incoming);
          } else {
            if (validSchedules.length === 0) {
              conv.followup(INTENT_CONSTANTS.SCHEDULES_LAST_INTENT.event, {});
            } else {
              conv.followup(INTENT_CONSTANTS.SCHEDULES_MIDDLE_INTENT.event, {});
            }
          }
        }

        resolve();

        return res;
      })
      .catch((error) => {
        conv.followup(INTENT_CONSTANTS.PROBLEM_INTENT.event, {});
        reject(error);
      });
  });
};

const schedulesMiddleHandler = (conv, params, registered, managers) => {
  conv.data.next_item_type = NEXT_ITEM_TYPE.SCHEDULES;
  const scheduleToBroadcast = conv.data.schedule_details;
  if (!scheduleToBroadcast) {
    conv.followup(INTENT_CONSTANTS.PROBLEM_INTENT.event, {});
    return;
  }

  moment.locale(_getLocale(conv));

  const eventStart = moment.tz(scheduleToBroadcast.start_datetime, CONSTANTS.TIMEZONE).format(CONSTANTS.DATE_FORMAT);

  const incoming = _getIncomingResponse(conv);
  incoming.speech = incoming.speech.replace('schedule_name', scheduleToBroadcast.name);
  incoming.speech = incoming.speech.replace('schedule_location', scheduleToBroadcast.location);
  incoming.speech = incoming.speech.replace('schedule_start', eventStart);

  incoming.displayText = incoming.displayText.replace('schedule_name', scheduleToBroadcast.name);
  incoming.displayText = incoming.displayText.replace('schedule_location', scheduleToBroadcast.location);
  incoming.displayText = incoming.displayText.replace('schedule_start', eventStart);

  _ask(conv, incoming);
};

const schedulesLastHandler = (conv, params, registered, managers) => {
  conv.data.next_item_type = NEXT_ITEM_TYPE.SCHEDULES;
  const scheduleToBroadcast = conv.data.schedule_details;
  if (!scheduleToBroadcast) {
    conv.followup(INTENT_CONSTANTS.PROBLEM_INTENT.event, {});
    return;
  }

  moment.locale(_getLocale(conv));

  const eventStart = moment.tz(scheduleToBroadcast.start_datetime, CONSTANTS.TIMEZONE).format(CONSTANTS.DATE_FORMAT);

  const incoming = _getIncomingResponse(conv);
  incoming.speech = incoming.speech.replace('schedule_name', scheduleToBroadcast.name);
  incoming.speech = incoming.speech.replace('schedule_location', scheduleToBroadcast.location);
  incoming.speech = incoming.speech.replace('schedule_start', eventStart);

  incoming.displayText = incoming.displayText.replace('schedule_name', scheduleToBroadcast.name);
  incoming.displayText = incoming.displayText.replace('schedule_location', scheduleToBroadcast.location);
  incoming.displayText = incoming.displayText.replace('schedule_start', eventStart);

  _ask(conv, incoming);
};

const noSchedulesHandler = (conv, params, registered, managers) => {
  const incoming = _getIncomingResponse(conv);
  conv.data.schedules_list = null;
  conv.data.next_item_type = NEXT_ITEM_TYPE.NO_SCHEDULE;
  conv.close(new SimpleResponse({
    text: incoming.displayText,
    speech: textToSpeech(incoming.speech)
  }));
};

const defaultCancelHandler = (conv, params, registered, managers) => {
  const incoming = _getIncomingResponse(conv);
  const nextType = conv.data.next_item_type;

  conv.close(new SimpleResponse({
    text: incoming.displayText,
    speech: textToSpeech(incoming.speech)
  }));
};

const problemHandler = (conv, params, registered, managers) => {
  console.log('problem intent handler');
  const incoming = _getIncomingResponse(conv);
  conv.close(new SimpleResponse({
    text: incoming.displayText,
    speech: textToSpeech(incoming.speech)
  }));
};

const problemLoginHandler = (conv, params, registered, managers) => {
  const incoming = _getIncomingResponse(conv);
  conv.close(new SimpleResponse({
    text: incoming.displayText,
    speech: textToSpeech(incoming.speech)
  }));
};

const defaultFallbackHandler = (conv, params, registered, managers) => {
  // reset prefix conversation
  conv.data.intent_prefix_content = null;

  const incoming = _getIncomingResponse(conv);
  conv.ask(new SimpleResponse({
    text: incoming.displayText,
    speech: textToSpeech(incoming.speech)
  }));
};

module.exports = {
  defaultWelcomeHandler,
  signInHandler,
  signedInHandler,
  announcementsListHandler,
  signalIdHandler,
  eventsListHandler,
  eventDetailsHandler,
  eventSkipHandler,
  declineEventHandler,
  attendEventHandler,
  schedulesListHandler,
  schedulesLastHandler,
  noEventsHandler,
  repeatIntentHandler,
  noSchedulesHandler,
  noAnnouncementsHandler,
  schedulesMiddleHandler,
  eventsMiddleHandler,
  eventsLastHandler,
  defaultCancelHandler,
  problemHandler,
  problemLoginHandler,
  defaultFallbackHandler,
  overviewHandler,
  noOverviewHandler,
  schedulesListOverviewHandler,
  scheduleDetailsHandler,
  cancelScheduleHandler,
  cancelScheduleConfirmedHandler,
  cancelScheduleDeclinedHandler
};