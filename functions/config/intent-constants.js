module.exports = {
  DEFAULT_WELCOME_INTENT: {
    intent: 'default.welcome.intent',
    event: 'DEFAULT_WELCOME_INTENT_EVENT',
    handler: 'defaultWelcomeHandler'
  },
  DEFAULT_FALLBACK_INTENT: {
    intent: 'default.fallback.intent',
    event: 'DEFAULT_FALLBACK_INTENT_EVENT',
    handler: 'defaultFallbackHandler'
  },
  DEFAULT_CANCEL_INTENT: {
    intent: 'default.cancel.intent',
    event: 'actions_intent_CANCEL',
    handler: 'defaultCancelHandler'
  },
  PROBLEM_INTENT: {
    intent: 'problem.intent',
    event: 'PROBLEM_INTENT_EVENT',
    handler: 'problemHandler'
  },
  SIGNAL_ID_INTENT: {
    intent: 'signal.id.intent',
    event: 'SIGNAL_ID_INTENT',
    handler: 'signalIdHandler'
  },
  SIGN_IN_INTENT: {
    intent: 'sign.in.intent',
    event: 'START_SIGNIN',
    handler: 'signInHandler'
  },
  SIGNED_IN_INTENT: {
    intent: 'signed.in.intent',
    event: 'actions_intent_SIGN_IN',
    handler: 'signedInHandler'
  },
  OVERVIEW_INTENT: {
    intent: 'overview.intent',
    event: 'OVERVIEW_INTENT_EVENT',
    handler: 'overviewHandler'
  },
  NO_OVERVIEW_INTENT: {
    intent: 'no.overview.intent',
    event: 'NO_OVERVIEW_INTENT_EVENT',
    handler: 'noOverviewHandler'
  },
  ANNOUNCEMENTS_LIST_INTENT: {
    intent: 'announcements.list.intent',
    event: 'ANNOUNCEMENTS_LIST_INTENT_EVENT',
    handler: 'announcementsListHandler'
  },
  ANNOUNCEMENTS_MIDDLE_INTENT: {
    intent: 'announcements.middle.intent',
    event: 'ANNOUNCEMENTS_MIDDLE_INTENT_EVENT',
    handler: 'announcementsMiddleHandler'
  },
  ANNOUNCEMENTS_LAST_INTENT: {
    intent: 'announcements.last.intent',
    event: 'ANNOUNCEMENTS_LAST_INTENT_EVENT',
    handler: 'announcementsLastHandler'
  },
  NO_ANNOUNCEMENTS_INTENT: {
    intent: 'no.announcements.intent',
    event: 'NO_ANNOUNCEMENTS_INTENT_EVENT',
    handler: 'noAnnouncementsHandler'
  },
  SCHEDULES_LIST_OVERVIEW_INTENT: {
    intent: 'schedules.list.overview.intent',
    event: 'SCHEDULES_LIST_OVERVIEW_INTENT_EVENT',
    handler: 'schedulesListOverviewHandler'
  },
  SCHEDULES_LIST_INTENT: {
    intent: 'schedules.list.intent',
    event: 'SCHEDULES_LIST_INTENT_EVENT',
    handler: 'schedulesListHandler'
  },
  SCHEDULES_MIDDLE_INTENT: {
    intent: 'schedules.middle.intent',
    event: 'SCHEDULES_MIDDLE_INTENT_EVENT',
    handler: 'schedulesMiddleHandler'
  },
  SCHEDULES_LAST_INTENT: {
    intent: 'schedules.last.intent',
    event: 'SCHEDULES_LAST_INTENT_EVENT',
    handler: 'schedulesLastHandler'
  },
  SCHEDULE_DETAILS_INTENT: {
    intent: 'schedule.details.intent',
    event: 'SCHEDULE_DETAILS_INTENT_EVENT',
    handler: 'scheduleDetailsHandler'
  },
  NO_SCHEDULES_INTENT: {
    intent: 'no.schedules.intent',
    event: 'NO_SCHEDULES_INTENT_EVENT',
    handler: 'noSchedulesHandler'
  },
  CANCEL_SCHEDULE_INTENT: {
    intent: 'cancel.schedule.intent',
    event: 'CANCEL_SCHEDULE_INTENT_EVENT',
    handler: 'cancelScheduleHandler'
  },
  CANCEL_SCHEDULE_CONFIRMED_INTENT: {
    intent: 'cancel.schedule.confirmed.intent',
    event: 'CANCEL_SCHEDULE_CONFIRMED_INTENT_EVENT',
    handler: 'cancelScheduleConfirmedHandler'
  },
  CANCEL_SCHEDULE_DECLINED_INTENT: {
    intent: 'cancel.schedule.declined.intent',
    event: 'CANCEL_SCHEDULE_DECLINED_INTENT_EVENT',
    handler: 'cancelScheduleDeclinedHandler'
  },
  EVENTS_LIST_INTENT: {
    intent: 'events.list.intent',
    event: 'EVENTS_LIST_INTENT_EVENT',
    handler: 'eventsListHandler'
  },
  EVENTS_MIDDLE_INTENT: {
    intent: 'events.middle.intent',
    event: 'EVENTS_MIDDLE_INTENT_EVENT',
    handler: 'eventsMiddleHandler'
  },
  EVENTS_LAST_INTENT: {
    intent: 'events.last.intent',
    event: 'EVENTS_LAST_INTENT_EVENT',
    handler: 'eventsLastHandler'
  },
  EVENT_DETAILS_INTENT: {
    intent: 'event.details.intent',
    event: 'EVENT_DETAILS_INTENT_EVENT',
    handler: 'eventDetailsHandler'
  },
  EVENT_SKIP_INTENT: {
    intent: 'event.skip.intent',
    event: 'EVENT_SKIP_INTENT_EVENT',
    handler: 'eventSkipHandler'
  },
  NO_EVENTS_INTENT: {
    intent: 'no.events.intent',
    event: 'NO_EVENTS_INTENT_EVENT',
    handler: 'noEventsHandler'
  },
  ATTEND_EVENT_INTENT: {
    intent: 'attend.event.intent',
    event: 'ATTEND_EVENT_INTENT_EVENT',
    handler: 'attendEventHandler'
  },
  DECLINE_EVENT_INTENT: {
    intent: 'decline.event.intent',
    event: 'DECLINE_EVENT_INTENT_EVENT',
    handler: 'declineEventHandler'
  },
  REPEAT_INTENT: {
    intent: 'repeat.intent',
    event: 'REPEAT_INTENT_EVENT',
    handler: 'repeatIntentHandler'
  },
  PROBLEM_LOGIN_INTENT: {
    intent: 'problem.login.intent',
    event: 'PROBLEM_LOGIN_INTENT_HANDLER',
    handler: 'problemLoginHandler'
  }
};