const CONSTANTS = require('../config/constants');
const {
  cleanEmailAddressForDocKey
} = require('../etc/utils');

const randomWords = require('random-words');

/**
 * this class is used to manage user's db collection queries + transaction
 */
class UsersManager {
  constructor(dbManager) {
    this._dbManager = dbManager;

    // As an admin, the app has access to read and write all data, regardless of Security Rules
    this._db = this._dbManager.database();

    this._usersCollection = this._db.ref(CONSTANTS.DB_COLLECTIONS.users);
  }

  /**
   * this method is used to get all users from the db collection
   * @return {Promise} - with user object array
   */
  getUsers() {
    return new Promise((resolve, reject) => {
      let users = [];
      this._usersCollection.once('value', (snapshot) => {
        snapshot.forEach((childSnapshot) => {
          users.push(childSnapshot.val());
        });

        resolve(users);
      });
    });
  }

  /**
   * this method is used to get user details by user ID
   * @param {String} userId - user id
   *
   * @return {Promise} - with user's details object
   */
  getUser(userId) {
    return new Promise((resolve, reject) => {
      this._usersCollection.child(userId).once('value', (snapshot) => {
        const userDetails = snapshot.val();
        resolve(userDetails);
      });
    });
  }

  /**
   * this method is used to add new user into user's collection
   * @param {Object} user - user object
   *
   * @return {Promise}
   */
  addUser(user) {
    const objToSave = {};
    const id = cleanEmailAddressForDocKey(user.email);

    const signalId = randomWords({exactly: 3, join: '-'});
    objToSave[id] = {
      email: user.email,
      name: user.name,
      user_sub: user.sub,
      id,
      signal_id: signalId,
      locale: user.locale,
      is_from_sheets: false
    };

    return this._usersCollection.update(objToSave);
  }

  /**
   * this method is user for broadcasting list of events to user
   * @param {Array} events           - list of event ids to be broadcast
   * @param {String} userId          - user id
   * @param {Boolean} is_from_sheets - whether or not this update is coming from google sheets
   *
   * @return {Promise}
   */
  broadcastEventsToUser(events, userId, is_from_sheets = false) {
    return new Promise((resolve, reject) => {
      if (!events) {
        resolve('no events to broadcast');
        return;
      }

      this.getUser(userId)
        .then((user) => {
          if (!user) {
            console.log('get user: ', userId);
            console.log(user);
            resolve('no valid user found');
            return user;
          }

          // grab current event to notify array, if doesn't exist, create empty array
          const currentEventToNotify = user[CONSTANTS.DB_FIELDS.events_to_notify] || [];

          // create latest event to notify data by merging both current and new data
          // and make sure it's unique
          const latestEventToNotify = [...new Set([...currentEventToNotify, ...events])];

          console.log('latest event to notify');
          console.log(latestEventToNotify);
          const data = {};
          data[CONSTANTS.DB_FIELDS.events_to_notify] = latestEventToNotify;
          data.is_from_sheets = is_from_sheets;

          return this._usersCollection.child(userId).update(data);
        })
        .then((res) => {
          resolve();
          return res;
        })
        .catch((err) => {
          console.log(err);
          reject(err);
        });
    });
  }

  /**
   * this method is used for updating user collection by user id
   * @param {String} userId - user id
   * @param {Object} data   - user data object
   *
   * @return {Promise}
   */
  generalUpdate(userId, data) {
    return this._usersCollection.child(userId).update(data);
  }

  /**
   * this method is used to store/add an event to be attended into user's event to attend list
   * @param {String} eventId - event id
   * @param {String} userId  - user id
   *
   * @return {Promise}
   */
  attendEvent(eventId, userId) {
    return new Promise((resolve, reject) => {
      if (!eventId) {
        resolve('no events to add to schedule');
        return;
      }

      this.getUser(userId)
        .then((user) => {
          if (!user) {
            resolve('no valid user found');
            return user;
          }

          // grab current events to attend array, if doesn't exist, create empty array
          const eventsToAttend = user[CONSTANTS.DB_FIELDS.events_to_attend] || [];

          if (eventsToAttend.indexOf(eventId) === -1) {
            eventsToAttend.push(eventId);
          }

          const data = {};
          data[CONSTANTS.DB_FIELDS.events_to_attend] = eventsToAttend;
          data.is_from_sheets = false;

          return this.generalUpdate(userId, data);
        })
        .then((res) => {
          resolve();
          return res;
        })
        .catch((err) => {
          console.log(err);
          reject(err);
        });
    });
  }

  /**
   * this method is used for removing one or more event id from the attended list
   * @param {Array} events         - event's ids
   * @param {String} userId         - user id
   * @param {Boolean} is_from_sheets - to indicate whether or not the update is coming from sheets
   *
   * @return {Promise}
   */
  cleanAttendedEvents(events, userId, is_from_sheets = false) {
    return new Promise((resolve, reject) => {
      if (!events) {
        resolve('no events to remove');
        return;
      }

      this.getUser(userId)
        .then((user) => {
          if (!user) {
            resolve('no valid user found');
            return user;
          }

          // grab current scheduled event array, if doesn't exist, create empty array
          const currentScheduledEvents = user[CONSTANTS.DB_FIELDS.events_to_attend] || [];

          // latest scheduled events should not exists in events input
          const latestScheduledEvents = currentScheduledEvents.filter((event) => {
            return events.indexOf(event) === -1;
          });

          const data = {};
          data[CONSTANTS.DB_FIELDS.events_to_attend] = latestScheduledEvents;
          data.is_from_sheets = is_from_sheets;

          return this.generalUpdate(userId, data);
        })
        .then((res) => {
          resolve();
          return res;
        })
        .catch((err) => {
          console.log(err);
          reject(err);
        });
    });
  }

  /**
   * this method is used to remove one or more event ids from the event to notify list
   * @param {Array} events           - list of event ids
   * @param {String} userId          - user id
   * @param {Boolean} is_from_sheets - to indicate whether or not update is coming from sheets
   *
   * @return {Promise}
   */
  removeEventsToNotifyFromUser(events, userId, is_from_sheets = false) {
    return new Promise((resolve, reject) => {
      if (!events) {
        resolve('no events to remove');
        return;
      }

      this.getUser(userId)
        .then((user) => {
          if (!user) {
            resolve('no valid user found');
            return user;
          }

          // grab current events to notify array, if doesn't exist, create empty array
          const currentEventToNotify = user[CONSTANTS.DB_FIELDS.events_to_notify] || [];

          // latest events to notify should not exists in events input
          const latestEventToNotify = currentEventToNotify.filter((event) => {
            return events.indexOf(event) === -1;
          });

          const data = {};
          data[CONSTANTS.DB_FIELDS.events_to_notify] = latestEventToNotify;
          data.is_from_sheets = is_from_sheets;

          return this.generalUpdate(userId, data);
        })
        .then((res) => {
          resolve();
          return res;
        })
        .catch((err) => {
          console.log(err);
          reject(err);
        });
    });
  }

  /**
   * this method is user for broadcasting list of announcements to user
   * @param {Array} announcements    - list of announcement ids to be broadcast
   * @param {String} userId          - user id
   * @param {Boolean} is_from_sheets - whether or not this update is coming from google sheets
   *
   * @return {Promise}
   */
  broadcastAnnouncementsToUser(announcements, userId, is_from_sheets = false) {
    return new Promise((resolve, reject) => {
      if (!announcements) {
        resolve('no announcements to broadcast');
        return;
      }
      this.getUser(userId)
        .then((user) => {
          if (!user) {
            console.log('get user: ', userId);
            console.log(user);
            resolve('no valid user found');
            return user;
          }

          // grab current announcements to notify array, if doesn't exist, create empty array
          const currentAnnouncementsToNotify = user[CONSTANTS.DB_FIELDS.announcements_to_notify] || [];

          // create latest announcements to notify data by merging both current and new data
          // and make sure it's unique
          const latestAnnouncementsToNotify = [...new Set([...currentAnnouncementsToNotify, ...announcements])];

          console.log('latest announcements to notify');
          console.log(latestAnnouncementsToNotify);

          const data = {};
          data[CONSTANTS.DB_FIELDS.announcements_to_notify] = latestAnnouncementsToNotify;
          data.is_from_sheets = is_from_sheets;

          return this.generalUpdate(userId, data);
        })
        .then((res) => {
          resolve();
          return res;
        })
        .catch((err) => {
          console.log(err);
          reject(err);
        });
    });
  }

  /**
   * this method is used to remove one or more announcement ids from the announcements to notify list
   * @param {Array} announcements    - list of announcement ids
   * @param {String} userId          - user id
   * @param {Boolean} is_from_sheets - to indicate whether or not update is coming from sheets
   *
   * @return {Promise}
   */
  removeAnnouncementsToNotifyFromUser(announcements, userId, is_from_sheets = false) {
    return new Promise((resolve, reject) => {
      if (!announcements) {
        resolve('no announcements to remove');
        return;
      }

      this.getUser(userId)
        .then((user) => {
          if (!user) {
            resolve('no valid user found');
            return user;
          }

          // grab current announcements to notify array, if doesn't exist, create empty array
          const currentAnnouncementsToNotify = user[CONSTANTS.DB_FIELDS.announcements_to_notify] || [];

          // latest announcements to notify should not exists in announcements input
          const latestAnnouncementsToNotify = currentAnnouncementsToNotify.filter((announcement) => {
            return announcements.indexOf(announcement) === -1;
          });

          const data = {};
          data[CONSTANTS.DB_FIELDS.announcements_to_notify] = latestAnnouncementsToNotify;
          data.is_from_sheets = is_from_sheets;

          return this.generalUpdate(userId, data);
        })
        .then((res) => {
          resolve();
          return res;
        })
        .catch((err) => {
          console.log(err);
          reject(err);
        });
    });
  }

  /**
   * this method is to move one/more announcements to announcements listened
   * @param {Array} announcements    - list of announcement ids
   * @param {String} userId          - user id
   * @param {Boolean} is_from_sheets - to indicate whether or not update is coming from sheet
   *
   * @return {Promise}
   */
  moveAnnouncementsToNotifyToListenedFromUser(announcements, userId, is_from_sheets = false) {
    return new Promise((resolve, reject) => {
      if (!announcements) {
        resolve('no announcements to remove');
        return;
      }

      let user = null;

      this.getUser(userId)
        .then((userRec) => {
          if (!userRec) {
            resolve('no valid user found');
            return userRec;
          }
          user = userRec;
          const currentAnnouncementsToMove = user[CONSTANTS.DB_FIELDS.announcements_listened] || [];

          const latestAnnouncementsToMove = [...new Set([...currentAnnouncementsToMove, ...announcements])];

          const data = {};
          data[CONSTANTS.DB_FIELDS.announcements_listened] = latestAnnouncementsToMove;
          data.is_from_sheets = is_from_sheets;

          return this.generalUpdate(userId, data);
        })
        .then((res) => {
          resolve();
          return res;
        })
        .catch((err) => {
          console.log(err);
          reject(err);
        });
    });
  }
}

module.exports = UsersManager;