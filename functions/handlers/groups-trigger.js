const groupsWriteTrigger = (snapshot, context, managers) => {
  const prevData = snapshot.before.val();
  const currentData = snapshot.after.val();

  const usersManager = managers.users;
  const eventsManager = managers.events;
  const announcementsManager = managers.announcements;

  let deletedStatus = false;

  // groups deleted
  if (!snapshot.after.exists()) {
    deletedStatus = true;
  }

  let newMembers = [];

  const prevMembers = prevData.members || [];
  const currentMembers = currentData.members || [];

  if (!deletedStatus) {
    newMembers = currentMembers.filter((member) => {
      return prevMembers.indexOf(member) === -1;
    });

    let events = null;
    let announcements = null;

    return new Promise((resolve, reject) => {
      eventsManager.getEventsToNotifyByGroupId(currentData.id)
        .then((res) => {
          console.log('events to notify:');
          console.log(res);
          events = res || [];
          return Promise.all(newMembers.map((member) => {
            return usersManager.broadcastEventsToUser(events, member, true);
          }));
        })
        .then((res) => {
          return announcementsManager.getAnnouncementsToNotifyByGroupId(currentData.id);
        })
        .then((res) => {
          announcements = res || [];

          return Promise.all(newMembers.map((member) => {
            return usersManager.broadcastAnnouncementsToUser(announcements, member, true);
          }));
        })
        .then((res) => {
          resolve();
          return res;
        })
        .catch((err) => {
          console.log('problem in broadcasting event');
          console.log(err);
          reject(err);
        });
    });
  } else {
    return Promise.resolve();
  }
};

module.exports = {
  groupsWriteTrigger
};