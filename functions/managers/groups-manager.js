const CONSTANTS = require('../config/constants');

/**
 * this class is used to manage groups collection data query
 */
class GroupsManager {
  constructor(dbManager) {
    this._dbManager = dbManager;

    // As an admin, the app has access to read and write all data, regardless of Security Rules
    this._db = this._dbManager.database();

    this._groupsCollection = this._db.ref(CONSTANTS.DB_COLLECTIONS.groups);
  }

  /**
   * this method is used to get group details by group id
   * @param {String} groupId - group id
   *
   * @return {Promise} - with group details object
   */
  getGroup(groupId) {
    return new Promise((resolve, reject) => {
      this._groupsCollection.child(groupId).once('value', (snapshot) => {
        const groupDetails = snapshot.val();
        resolve(groupDetails);
      });
    });
  }

  /**
   * this method is used to get all groups data from db collection
   *
   * @return {Promise} - with an object array of group's details
   */
  getGroups() {
    return new Promise((resolve, reject) => {
      let groups = [];
      this._groupsCollection.once('value', (snapshot) => {
        snapshot.forEach((childSnapshot) => {
          groups.push(childSnapshot.val());
        });

        resolve(groups);
      });
    });
  }

  /**
   * this method is to check if user is belong to a particular group
   * @param {String} userId - user id
   * @param {*} groupId     - group id
   *
   * @return {Promise} - with boolean
   */
  isInGroup(userId, groupId) {
    return new Promise((resolve, reject) => {
      this._groupsCollection.child(groupId).once('value', (snapshot) => {
        const groupDetails = snapshot.val();
        resolve(groupDetails.members && groupDetails.members.indexOf(userId) > -1);
      });
    });
  }
}

module.exports = GroupsManager;