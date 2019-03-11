const admin = require('firebase-admin');

const CONSTANTS = require('../config/constants');

class DBManager {
  constructor(firebaseConfig) {
    // Initialize the app with a service account, granting admin privileges
    this._firebaseAdmin = admin.initializeApp(firebaseConfig);

    // As an admin, the app has access to read and write all data, regardless of Security Rules
    this._db = this._firebaseAdmin.database();

    this._oauthCollection = this._db.ref(CONSTANTS.DB_COLLECTIONS.oauth);
  }

  getFirebaseAdmin() {
    return this._firebaseAdmin;
  }

  storeOAuthToken(tokens) {
    return this._oauthCollection.set(tokens);
  }

  getOAuthToken() {
    return new Promise((resolve, reject) => {
      return this._oauthCollection.once('value').then((snapshot) => {
        const token = snapshot.val();
        resolve(token);

        return token;
      });
    });
  }
}

module.exports = DBManager;