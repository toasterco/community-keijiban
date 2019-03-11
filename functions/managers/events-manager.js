const CONSTANTS = require('../config/constants');

/**
 * this class is to manage Events related database collection
 */
class EventsManager {
  constructor(dbManager) {
    this._dbManager = dbManager;

    // As an admin, the app has access to read and write all data, regardless of Security Rules
    this._db = this._dbManager.database();

    this._eventsCollection = this._db.ref(CONSTANTS.DB_COLLECTIONS.events);
    this._eventsToNotifyCollection = this._db.ref(CONSTANTS.DB_COLLECTIONS.events_to_notify);
    this._eventsCancelledCollection = this._db.ref(CONSTANTS.DB_COLLECTIONS.events_cancelled);
  }

  /**
   * this method is used to get event's details by id
   * @param {String} eventId - event id
   *
   * @return {Promise} - with event object
   */
  getEvent(eventId) {
    return new Promise((resolve, reject) => {
      this._eventsCollection.child(eventId).once('value', (snapshot) => {
        const eventDetails = snapshot.val();
        resolve(eventDetails);
      });
    });
  }

  /**
   * this method is used to get an array of events to notify by group id
   * @param {String} groupId - group id
   *
   * @return {Promise} - array of event's ids
   */
  getEventsToNotifyByGroupId(groupId) {
    return new Promise((resolve, reject) => {
      this._eventsToNotifyCollection.child(groupId).once('value', (snapshot) => {
        const eventDetails = snapshot.val();
        resolve(eventDetails);
      });
    });
  }

  /**
   * this method is used to get an array of cancelled events by group id
   * @param {String} groupId - group id
   *
   * @return {Promise} - array of event's ids
   */
  getEventsCancelledByGroupId(groupId) {
    return new Promise((resolve, reject) => {
      this._eventsCancelledCollection.child(groupId).once('value', (snapshot) => {
        const eventDetails = snapshot.val();
        resolve(eventDetails);
      });
    });
  }

  /**
   * this method is used to remove an array of event's ids from the events to notify collection by group id
   * @param {Array} events   - array of events's ids
   * @param {String} groupId - group id
   *
   * @return {Promise}
   */
  removeEventsToNotifyFromGroup(events, groupId) {
    return new Promise((resolve, reject) => {
      if (!events) {
        resolve('no events to cancel');
        return;
      }

      this.getEventsToNotifyByGroupId(groupId)
        .then((group) => {
          if (!group) {
            resolve('no valid group found');
            return group;
          }
          const currentEvents = group || [];

          const latestEvents = currentEvents.filter((event) => {
            return events.indexOf(event) === -1;
          });

          return this._eventsToNotifyCollection.child(groupId).set(latestEvents);
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

module.exports = EventsManager;