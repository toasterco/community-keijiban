const moment = require('moment-timezone');
const CONSTANTS = require('../config/constants');

const _broadcastEventsAndAnnouncements = (memberData, member, managers) => {
  return new Promise((resolve, reject) => {
    managers.users.broadcastEventsToUser(memberData.eventsToNotify, member, true)
      .then((res) => {
        return managers.users.removeEventsToNotifyFromUser(memberData.eventsToRemove, member, true);
      })
      .then((res) => {
        return managers.users.broadcastAnnouncementsToUser(memberData.announcementsToNotify, member, true);
      })
      .then((res) => {
        return managers.users.removeAnnouncementsToNotifyFromUser(memberData.announcementsToCancel, member, true);
      })
      .then((res) => {
        resolve();
        return res;
      })
      .catch((err) => {
        console.log('problem in broadcasting events and announcements to user');
        console.log(err);
        return reject(err);
      });
  });
};

const _cleanExpiredAnnouncementsToNotify = (group, managers) => {
  return new Promise((resolve, reject) => {
    console.log('begin cleaning announcement for group:', group.id);
    managers.announcements.getAnnouncementsToNotifyByGroupId(group.id)
      .then((announcements) => {
        if (!announcements) {
          console.log('no announcements to notify for group: ', group.id);
          return Promise.resolve(null);
        }

        return Promise.all(announcements.map((announcement) => {
          return managers.announcements.getAnnouncement(announcement);
        }));
      })
      .then((announcements) => {
        if (!announcements) {
          return Promise.resolve(null);
        }

        return Promise.all(announcements.map((announcement) => {
          // get current date time
          const currentDateTime = moment().tz(CONSTANTS.TIMEZONE);

          // grab list of expired annoucements
          const expiredAnnouncements = announcements.filter((announcement) => {
            const announcementEndDate = moment.tz(announcement.end_datetime, CONSTANTS.TIMEZONE);

            return currentDateTime.isAfter(announcementEndDate);
          });

          const announcementsToRemove = expiredAnnouncements.map((announcement) => {
            return announcement.id;
          });

          console.log('announcement to remove:', announcementsToRemove.join(','));

          return managers.announcements.removeAnnouncementsToNotifyFromGroup(announcementsToRemove, group.id);
        }));
      })
      .then((res) => {
        resolve();
        return res;
      })
      .catch((err) => {
        console.log('problem in cleaning announcements to notify');
        console.log(err);
        reject(err);
      });
  });
};

const _cleanExpiredEventsToNotify = (group, managers) => {
  return new Promise((resolve, reject) => {
    managers.events.getEventsToNotifyByGroupId(group.id)
      .then((events) => {
        if (!events) {
          console.log('no events to notify for group: ', group.id);
          return Promise.resolve(null);
        }

        return Promise.all(events.map((event) => {
          return managers.events.getEvent(event);
        }));
      })
      .then((events) => {
        if (!events) {
          return Promise.resolve(null);
        }

        return Promise.all(events.map((event) => {

          // get current date time
          const currentDateTime = moment().tz(CONSTANTS.TIMEZONE);

          // grab list of expired events
          const expiredEvents = events.filter((event) => {
            const eventStartDate = moment.tz(event.start_datetime, CONSTANTS.TIMEZONE);

            return currentDateTime.isSameOrAfter(eventStartDate);
          });

          const eventsToRemove = expiredEvents.map((event) => {
            return event.id;
          });

          console.log('events to remove:');
          console.log(eventsToRemove);

          return managers.events.removeEventsToNotifyFromGroup(eventsToRemove, group.id);
        }));
      })
      .then((res) => {
        resolve();
        return res;
      })
      .catch((err) => {
        console.log('problem in cleaning announcements to notify');
        console.log(err);
        reject(err);
      });
  });
};

const broadcastEventsAndAnnouncements = (request, response, managers) => {
  console.log('syncing!');
  let groups = null;

  let eventsToNotify = null;
  let eventsToCancel = null;
  let announcementsToNotify = null;
  let announcementsToCancel = null;

  let membersDetails = {};
  managers.groups.getGroups()
    .then((groupsList) => {
      // cache data into variable for future use
      groups = groupsList;

      console.log('list og groups');
      console.log(groups);

      // get clean expired announcements to notify from group
      return Promise.all(
        groups.map((group) => {
          return _cleanExpiredAnnouncementsToNotify(group, managers);
        })
      );
    })
    .then((res) => {
      // get clean expired events to notify from group
      return Promise.all(
        groups.map((group) => {
          return _cleanExpiredEventsToNotify(group, managers);
        })
      );
    })
    .then((res) => {
      // get list of event to notify
      return Promise.all(
        groups.map((group) => {
          return managers.events.getEventsToNotifyByGroupId(group.id);
        })
      );
    })
    .then((events) => {
      eventsToNotify = events;
      console.log('EVENTS TO NOTIFY');
      console.log(eventsToNotify);
      // get list of event to cancal
      return Promise.all(
        groups.map((group) => {
          return managers.events.getEventsCancelledByGroupId(group.id);
        })
      );
    })
    .then((events) => {
      eventsToCancel = events;
      console.log('EVENTS TO CANCEL');
      console.log(eventsToCancel);
      // get list of announcements to notify
      return Promise.all(
        groups.map((group) => {
          return managers.announcements.getAnnouncementsToNotifyByGroupId(group.id);
        })
      );
    })
    .then((announcements) => {
      announcementsToNotify = announcements;
      console.log('ANNOUNCEMENTS TO NOTIFY');
      console.log(announcementsToNotify);
      // get list of announcements to cancel
      return Promise.all(
        groups.map((group) => {
          return managers.announcements.getAnnouncementsCancelledByGroupId(group.id);
        })
      );
    })
    .then((announcements) => {
      announcementsToCancel = announcements;
      console.log('ANNOUNCEMENTS TO CANCEL');
      console.log(announcementsToCancel);

      groups.forEach((group, i) => {
        const members = group.members;
        if (members) {
          members.forEach((member) => {
            if (!membersDetails[member]) {
              membersDetails[member] = {};
              membersDetails[member].eventsToNotify = [];
              membersDetails[member].eventsToCancel = [];
              membersDetails[member].announcementsToNotify = [];
              membersDetails[member].announcementsToCancel = [];
            }

            // if there is list of event to be notified for this group, merge events to notify list for each member
            if (eventsToNotify[i]) {
              membersDetails[member].eventsToNotify = [...new Set([...membersDetails[member].eventsToNotify, ...eventsToNotify[i]])];
            }

            // if there is list of event to be cancelled for this group, merge events to cancel list to each member
            if (eventsToCancel[i]) {
              membersDetails[member].eventsToCancel = [...new Set([...membersDetails[member].eventsToCancel, ...eventsToCancel[i]])];

              // we need to check if items in events to cancel exists in events to notify, remove it
              // we assume that user might belong to multiple groups
              // and event might exist in other group
              membersDetails[member].eventsToCancel.forEach((eventToCancel, cancelIndex) => {
                if (membersDetails[member].eventsToNotify.indexOf(eventToCancel) !== -1) {
                  membersDetails[member].eventsToCancel.splice(cancelIndex, 1);
                }
              });
            }

            // if there is announcement to notify for each member, merge all announcement to notify list to each member
            if (announcementsToNotify[i]) {
              membersDetails[member].announcementsToNotify = [...new Set([...membersDetails[member].announcementsToNotify, ...announcementsToNotify[i]])];
            }

            // if there is announcement list to cancel for each member, merge all announcement to cancel list to each member
            if (announcementsToCancel[i]) {
              membersDetails[member].announcementsToCancel = [...new Set([...membersDetails[member].announcementsToCancel, ...announcementsToCancel[i]])];

              // we need to check if items in announcements to cancel exists in announcements to notify, remove it
              // we assume that user might belong to multiple groups
              // and event might exist in other group
              membersDetails[member].announcementsToCancel.forEach((announcementToCancel, cancelIndex) => {
                if (membersDetails[member].announcementsToNotify.indexOf(announcementToCancel) !== -1) {
                  membersDetails[member].announcementsToCancel.splice(cancelIndex, 1);
                }
              });
            }
          });
        }
      });

      console.log('MEMBER DETAILS');
      console.log(membersDetails);

      return Promise.all(Object.keys(membersDetails).map((member) => {
        return _broadcastEventsAndAnnouncements(membersDetails[member], member, managers);
      }));
    })
    .then((res) => {
      return response.json({status: 'ok'});
    })
    .catch((err) => {
      console.log('PROBLEM IN BROADCASTING EVENTS AND ANNOUNCEMENTS');
      console.log(err);
      return response.status(500).send(err);
    });
};

module.exports = {
  broadcastEventsAndAnnouncements
};