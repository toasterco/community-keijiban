const CONSTANTS = require('../config/constants');
const moment = require('moment-timezone');
const fs = require('fs');

class JSONManager {
  constructor(firebaseAdmin) {
    // get firebase bucket reference
    this._firebaseStorage = firebaseAdmin.storage().bucket();
  }

  /**
   * this method is used to construct json file, to be used by blurt's device
   * @param {String} userId   - user id
   * @param {Object} managers - list of managers to be used across
   *
   * @return {Promise}
   */
  constructJSON(userId, managers) {
    return new Promise((resolve, reject) => {
      let announcements = null;
      let schedules = null;
      let events = null;
      let userDetail = null;
      let filename = null;
      let statusFilename = null;

      managers.users.getUser(userId)
        .then((user) => {
          if (!user || (user && !user.signal_id)) {
            reject(new Error('invalid user or signal id'));
            return;
          }

          userDetail = {...user};

          // let's generate audio blurts for user if either one of the conditions are met
          return !userDetail.announcement_audio || !userDetail.schedule_audio || !userDetail.event_audio ? managers.tts.generateAudioFilesForUser(userDetail, managers) : Promise.resolve();
        })
        .then((res) => {
          // grab list of events to notify
          const eventsToNotify = userDetail[CONSTANTS.DB_FIELDS.events_to_notify] || [];

          // grab list of scheduled event/events to attend
          const schedulesToNotify = userDetail[CONSTANTS.DB_FIELDS.events_to_attend] || [];

          // if there is no event to notify, move on
          if (!eventsToNotify || !eventsToNotify.length) {
            return Promise.resolve([]);
          }

          // cleaned/filtered events to notify should be eventsToNotify - schedulesToNotify
          const filteredEventsToNotify = eventsToNotify.filter((event) => {
            return schedulesToNotify.indexOf(event) === -1;
          });

          // get list of events details
          return Promise.all(filteredEventsToNotify.map((event) => {
            return managers.events.getEvent(event);
          }));
        })
        .then((eventsToNotify) => {
          // store event details to var, for future reference
          events = [...eventsToNotify];

          // grab list of announcements to notify
          const announcementsToNotify = userDetail[CONSTANTS.DB_FIELDS.announcements_to_notify] || [];

          // grab list of listened announcements to notify
          const listenedAnnouncements = userDetail[CONSTANTS.DB_FIELDS.announcements_listened] || [];

          // if there is no announcements to notify, move on to the next steps
          if (!announcementsToNotify || !announcementsToNotify.length) {
            return Promise.resolve([]);
          }

          // filtered list of announcements should be announcementsToNotify - listenedAnnouncements
          const filteredAnnouncementsToNotify = announcementsToNotify.filter((announcement) => {
            return listenedAnnouncements.indexOf(announcement) === -1;
          });

          // get list of announcements details
          return Promise.all(filteredAnnouncementsToNotify.map((announcement) => {
            return managers.announcements.getAnnouncement(announcement);
          }));
        })
        .then((announcementsToNotify) => {
          // store announcements details into var for future reference
          announcements = [...announcementsToNotify];

          // get scheduled/events to attend list
          const schedulesToNotify = userDetail[CONSTANTS.DB_FIELDS.events_to_attend] || [];

          // if there is no scheduled event, move on
          if (!schedulesToNotify || !schedulesToNotify.length) {
            return Promise.resolve([]);
          }

          // get list of schedules details
          return Promise.all(schedulesToNotify.map((schedule) => {
            return managers.events.getEvent(schedule);
          }));
        })
        .then((schedulesToNotify) => {
          // stored scheduled/events to attend details into var
          schedules = [...schedulesToNotify];

          // create empty notificationsList
          const notificationList = [];

          // get current date time
          const currentDateTime = moment().tz(CONSTANTS.TIMEZONE);

          // get valid events, start date time should be no later than current date time
          const validEvents = events.filter((event) => {
            if (!event || !event.start_datetime) {
              return false;
            }

            const startDate = moment.tz(event.start_datetime, CONSTANTS.TIMEZONE);

            return currentDateTime.isBefore(startDate);
          });

          // create timestamp, to be used across
          const currentTime = moment();

          console.log('valid events');
          console.log(validEvents);

          // construct events notification
          if (validEvents.length > 0) {
            notificationList.push({
              id: 1,
              type: CONSTANTS.NOTIFICATIONS_TYPE.event,
              intent_type: 'audio',
              start_time: currentTime.unix(),
              language: CONSTANTS.LOCALE,
              msg: userDetail.event_audio
            });
          }

          // get valid announcements, end date time should be no lated than current timestamp
          const validAnnouncements = announcements.filter((announcement) => {
            if (!announcement || !announcement.end_datetime) {
              return false;
            }

            const endDate = moment.tz(announcement.end_datetime, CONSTANTS.TIMEZONE);

            return currentDateTime.isSameOrBefore(endDate);
          });

          // construct announcements notification
          if (validAnnouncements.length > 0) {
            notificationList.push({
              id: 2,
              type: CONSTANTS.NOTIFICATIONS_TYPE.announcement,
              intent_type: 'audio',
              start_time: validEvents.length > 0 ? currentTime.add(1, 'm').unix() : currentTime.unix(), // add 1 minute timediff if there is events. this is for sequencing the blurts output
              language: CONSTANTS.LOCALE,
              msg: userDetail.announcement_audio
            });
          }

          // remove expired schedule, if start time is more than current timestamp
          const validSchedules = schedules.filter((schedule) => {
            if (!schedule || !schedule.start_datetime) {
              return false;
            }
            const eventStartDate = moment.tz(schedule.start_datetime, CONSTANTS.TIMEZONE);

            return currentDateTime.isSameOrBefore(eventStartDate);
          });

          console.log('valid schedules');
          console.log(validSchedules);

          // sort events based on date
          validSchedules.sort((eventA, eventB) => {
            const eventAStartDate = moment.tz(eventA.start_datetime, CONSTANTS.TIMEZONE);

            const eventBStartDate = moment.tz(eventB.start_datetime, CONSTANTS.TIMEZONE);

            if (eventBStartDate.isAfter(eventAStartDate)) {
              return -1;
            }

            if (eventAStartDate.isAfter(eventBStartDate)) {
              return 1;
            }
          });

          // construct schedules
          validSchedules.forEach((schedule, i) => {
            // set time to announce one hour before the event start time
            const startDate = moment.tz(schedule.start_datetime, CONSTANTS.TIMEZONE).subtract(1,'h').unix();

            notificationList.push({
              id: (3 + i),
              type: CONSTANTS.NOTIFICATIONS_TYPE.schedule,
              intent_type: 'text',
              start_time: startDate,
              language: CONSTANTS.LOCALE,
              msg: userDetail.schedule_audio,
              name: schedule.name,
              description: schedule.description
            });
          });

          console.log(notificationList);

          filename = `${CONSTANTS.FIREBASE_TMP_FOLDER}/${userDetail.signal_id}.json`;

          return new Promise((resolveWrite, rejectWrite) => {
            // create json temp file
            fs.writeFile(filename, JSON.stringify({results: notificationList, is_from_sheets: userDetail.is_from_sheets}), 'utf8', (error) => {
              if (error) {
                rejectWrite(error);
              }
              resolveWrite();
            });
          });
        })
        .then((res) => {
          // upload temp file to bucket
          return this._firebaseStorage.upload(filename, { destination: `${CONSTANTS.JSON_BUCKET_FOLDER}/${userDetail.signal_id}.json` });
        })
        .then((res) => {
          console.log('file uploaded', filename);
          // Delete the temporary file.
          return new Promise((resolveClean, rejectClean) => {
            console.log('cleaning temp file', filename);
            fs.unlink(filename, (err) => {
              if (err) {
                console.error(`problem in cleaning temp file.`);
                console.error(err);
                rejectClean(err);
              } else {
                console.log(`temp file cleaned`);
                resolveClean();
              }
            });
          });
        })
        // store device busy status into file
        .then((res) => {
          statusFilename = `${CONSTANTS.FIREBASE_TMP_FOLDER}/${userDetail.signal_id}-status.json`;

          return new Promise((resolveWrite, rejectWrite) => {
            fs.writeFile(statusFilename, JSON.stringify({status: userDetail.is_from_sheets}), 'utf8', (error) => {
              if (error) {
                rejectWrite(error);
              }

              resolveWrite();
            });
          });
        })
        // upload status file to bucket
        .then((res) => {
          return this._firebaseStorage.upload(statusFilename, { destination: `${CONSTANTS.JSON_BUCKET_FOLDER}/${userDetail.signal_id}-status.json` });
        })
        .then((res) => {
          console.log('file uploaded', statusFilename);
          // Delete the temporary file.
          return new Promise((resolveClean, rejectClean) => {
            console.log('cleaning temp file', statusFilename);
            fs.unlink(statusFilename, (err) => {
              if (err) {
                console.error(`problem in cleaning temp file.`);
                console.error(err);
                rejectClean(err);
              } else {
                console.log(`temp file cleaned`);
                resolveClean();
              }
            });
          });
        })
        .then((res) => {
          resolve();
          return res;
        })
        .catch((error) => {
          console.log('problem in constructing json');
          console.log(error);
          reject(error);
        });
    });
  }
}

module.exports = JSONManager;