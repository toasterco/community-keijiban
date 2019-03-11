const CONSTANTS = require('../config/constants');

/**
 * this method is for managing event's attendance collection
 */
class EventsAttendanceManager {
  constructor(dbManager) {
    this._dbManager = dbManager;

    // As an admin, the app has access to read and write all data, regardless of Security Rules
    this._db = this._dbManager.database();

    this._attendanceCollection = this._db.ref(CONSTANTS.DB_COLLECTIONS.events_attendance);
  }

  /**
   * this method is used for getting event attendance by event id
   * @param {String} eventId - event id
   *
   * @return {Promise} - with event attendance object that consists of calendar event id + attendance list
   */
  getAttendance(eventId) {
    return new Promise((resolve, reject) => {
      this._attendanceCollection.child(eventId).once('value', (snapshot) => {
        const attendanceDetails = snapshot.val();
        resolve(attendanceDetails);
      });
    });
  }

  /**
   * this method is used for adding user to event's attendance list
   * @param {String} userId     - user id
   * @param {*} eventId         - event id
   * @param {*} calendarEventId - google calendar event id
   *
   * @return {Promise}
   */
  addAttendance(userId, eventId, calendarEventId) {
    return new Promise((resolve, reject) => {
      this.getAttendance(eventId)
        .then((event) => {
          let eventAttendance = event && event.attendance ? event.attendance : [];

          if (eventAttendance.indexOf(userId) === -1) {
            eventAttendance.push(userId);
          }

          return this._attendanceCollection.child(eventId).update({
            calendar_event_id: calendarEventId,
            attendance: eventAttendance
          });
        })
        .then((res) => {
          resolve();
          return res;
        })
        .catch((err) => {
          reject(err);
        });
    });
  }
}

module.exports = EventsAttendanceManager;