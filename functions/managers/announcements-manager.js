const CONSTANTS = require('../config/constants');

/**
 * this class is to manage Announcements related database collection
 */
class AnnouncementsManager {
  constructor(dbManager) {
    this._dbManager = dbManager;

    // As an admin, the app has access to read and write all data, regardless of Security Rules
    this._db = this._dbManager.database();

    this._announcementsCollection = this._db.ref(CONSTANTS.DB_COLLECTIONS.announcements);
    this._announcementsToNotifyCollection = this._db.ref(CONSTANTS.DB_COLLECTIONS.announcements_to_notify);
    this._announcementsCancelledCollection = this._db.ref(CONSTANTS.DB_COLLECTIONS.announcements_cancelled);
  }

  /**
   * this method is to get announcement's details by id
   * @param {String} announcementId - announcement id
   *
   * @return {Promise} with announcement's details object
   */
  getAnnouncement(announcementId) {
    return new Promise((resolve, reject) => {
      this._announcementsCollection.child(announcementId).once('value', (snapshot) => {
        const announcementsDetails = snapshot.val();
        resolve(announcementsDetails);
      });
    });
  }

  /**
   * this method is to get the list of announcements to notify by group id
   * @param {String} groupId - group id
   *
   * @return {Promise} with an array of announcements ids to be notified
   */
  getAnnouncementsToNotifyByGroupId(groupId) {
    return new Promise((resolve, reject) => {
      this._announcementsToNotifyCollection.child(groupId).once('value', (snapshot) => {
        const announcementDetails = snapshot.val();
        resolve(announcementDetails);
      });
    });
  }

  /**
   * this method is to get the list of cancelled announcements by group id
   * @param {String} groupId - group id
   *
   * @return {Promise} with an array of cancelled announcements ids
   */
  getAnnouncementsCancelledByGroupId(groupId) {
    return new Promise((resolve, reject) => {
      this._announcementsCancelledCollection.child(groupId).once('value', (snapshot) => {
        const announcementDetails = snapshot.val();
        resolve(announcementDetails);
      });
    });
  }

  /**
   * this method is used to remove an array of announcement's ids from the announcements to notify collection by group id
   * @param {Array} announcements - array of announcement's ids
   * @param {String} groupId      - group id
   *
   * @return {Promise}
   */
  removeAnnouncementsToNotifyFromGroup(announcements, groupId) {
    return new Promise((resolve, reject) => {
      if (!announcements) {
        resolve('no announcements to cancel');
        return;
      }

      this.getAnnouncementsToNotifyByGroupId(groupId)
        .then((group) => {
          if (!group) {
            resolve('no valid group found');
            return group;
          }
          const currentAnnouncements = group || [];

          const latestAnnouncements = currentAnnouncements.filter((announcement) => {
            return announcements.indexOf(announcement) === -1;
          });

          return this._announcementsToNotifyCollection.child(groupId).set(latestAnnouncements);
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

module.exports = AnnouncementsManager;