const moment = require('moment-timezone');

const {
  cleanGroupNameForId
} = require('../etc/utils');

const CONSTANTS = require('../config/constants');

const _insertToBroadcastCollection = (group, eventId, snapshotRef, isAnnouncement) => {
  const groupId = cleanGroupNameForId(group);

  const dbCollection = CONSTANTS.DB_COLLECTIONS[isAnnouncement ? 'announcements_to_notify' : 'events_to_notify'];

  return snapshotRef.parent.parent.child(dbCollection).transaction((broadcast_events) => {
    broadcast_events = broadcast_events || {};

    broadcast_events[groupId] = broadcast_events[groupId] || [];
    if (broadcast_events[groupId].indexOf(eventId) === -1) {
      broadcast_events[groupId].push(eventId);
    }
    return broadcast_events;
  });
};

const _removeFromBroadcastCollection = (group, eventId, snapshotRef, isAnnouncement) => {
  const groupId = cleanGroupNameForId(group);

  const dbCollection = CONSTANTS.DB_COLLECTIONS[isAnnouncement ? 'announcements_to_notify' : 'events_to_notify'];

  return snapshotRef.parent.parent.child(dbCollection).transaction((broadcast_events) => {
    if (!broadcast_events || !broadcast_events[groupId]) {
      return broadcast_events;
    }

    const index = broadcast_events[groupId].indexOf(eventId);

    if (index === -1) {
      return broadcast_events;
    }

    broadcast_events[groupId].splice(index, 1);
    return broadcast_events;
  });
};

const _insertToCancelledCollection = (group, eventId, snapshotRef, isAnnouncement) => {
  const groupId = cleanGroupNameForId(group);

  const dbCollection = CONSTANTS.DB_COLLECTIONS[isAnnouncement ? 'announcements_cancelled' : 'events_cancelled'];

  return snapshotRef.parent.parent.child(dbCollection).transaction((broadcast_events) => {
    broadcast_events = broadcast_events || {};

    broadcast_events[groupId] = broadcast_events[groupId] || [];
    if (broadcast_events[groupId].indexOf(eventId) === -1) {
      broadcast_events[groupId].push(eventId);
    }
    return broadcast_events;
  });
};

const _removeFromCancelledCollection = (group, eventId, snapshotRef, isAnnouncement) => {
  const groupId = cleanGroupNameForId(group);

  const dbCollection = CONSTANTS.DB_COLLECTIONS[isAnnouncement ? 'announcements_cancelled' : 'events_cancelled'];

  return snapshotRef.parent.parent.child(dbCollection).transaction((broadcast_events) => {
    if (!broadcast_events || !broadcast_events[groupId]) {
      return broadcast_events;
    }

    const index = broadcast_events[groupId].indexOf(eventId);

    if (index === -1) {
      return broadcast_events;
    }

    broadcast_events[groupId].splice(index, 1);
    return broadcast_events;
  });
};

const _handleWriteEvent = (snapshot, isAnnouncement) => {
  // Grab the current value of what was written to the Realtime Database.
  const newData = snapshot.after.val();
  const prevData = snapshot.before.val();

  let removedGroups = [];

  // Exit when the data is deleted.
  if (!snapshot.after.exists()) {
    return Promise.all(prevData.groups.map((group) => {
      return new Promise((resolve, reject) => {
        _insertToCancelledCollection(group, prevData.id, snapshot.after.ref, isAnnouncement)
          .then((res) => {
            return _removeFromBroadcastCollection(group, prevData.id, snapshot.after.ref, isAnnouncement);
          })
          .then((res) => {
            resolve();
            return res;
          })
          .catch((err) => {
            reject(err);
          });
      });
    }));
  }

  if (snapshot.before.exists()) {
    const newGroups = newData.groups || [];
    const oldGroups = prevData.groups || [];

    removedGroups = oldGroups.filter((group) => {
      return newGroups.indexOf(group) === -1;
    });
  }

  const currentDateTime = moment().tz(CONSTANTS.TIMEZONE);

  const eventStartDate = moment.tz(newData.start_datetime, CONSTANTS.TIMEZONE);
  const eventEndDate = moment.tz(newData.end_datetime, CONSTANTS.TIMEZONE);
  const eventId = newData.id;


  // only store unexpired event/announcements
  if (eventStartDate.isSameOrAfter(currentDateTime) || (isAnnouncement && eventEndDate.isSameOrAfter(currentDateTime))) {
    return Promise.all(newData.groups.map((group) => {
      if (newData.is_active === 'TRUE') {
        return new Promise((resolve, reject) => {
          // remove it from cancelled collection
          _removeFromCancelledCollection(group, eventId, snapshot.after.ref, isAnnouncement)
            .then((res) => {
              // insert to broadcast collection
              return _insertToBroadcastCollection(group, eventId, snapshot.after.ref, isAnnouncement);
            })
            .then((res) => {
              return Promise.all(
                // remove clear those that needs to be removed from broadcast collection
                removedGroups.map((removedGroup) => {
                  return _removeFromBroadcastCollection(removedGroup, eventId, snapshot.after.ref, isAnnouncement);
                })
              );
            })
            .then((res) => {
              return Promise.all(
                // move removed events/announcements to cancelled collection
                removedGroups.map((removedGroup) => {
                  return _insertToCancelledCollection(removedGroup, eventId, snapshot.after.ref, isAnnouncement);
                })
              );
            })
            .then((res) => {
              resolve();
              return res;
            })
            .catch((err) => {
              reject(err);
            });
        });
      } else {
        return new Promise((resolve, reject) => {
          // insert to cancelled collection
          _insertToCancelledCollection(group, eventId, snapshot.after.ref, isAnnouncement)
            .then((res) => {
              // remove from broadcast collection
              return _removeFromBroadcastCollection(group, eventId, snapshot.after.ref, isAnnouncement);
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
    }));
  } else {
    return Promise.resolve();
  }
};

const eventsWriteTrigger = (snapshot, context) => {
  return _handleWriteEvent(snapshot);
};

const announcementsWriteTrigger = (snapshot, context) => {
  return _handleWriteEvent(snapshot, true);
};

module.exports = {
  eventsWriteTrigger,
  announcementsWriteTrigger
};