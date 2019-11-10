let server;
const _ = require("lodash");
const { sanitize } = require("../../utils");

function init(hapiServer) {
  server = hapiServer;
  server.route({
    method: "GET",
    path: "/create",
    handler: createEvent
  });
  server.route({
    method: "GET",
    path: "/events/{slug}",
    handler: eventDetail
  });

  server.route({
    method: "GET",
    path: "/events/{slug}/edit",
    handler: editEvent
  });

  server.route({
    method: "GET",
    path: "/events/{slug}/discussion",
    handler: eventDisussion
  });
}

async function createEvent(req, h) {
  if (!req.loggedIn()) {
    return h.toLogin();
  }
  const groups = await server
    .getService("groups")
    .getGroupsForUser(req.app.user.id);

  let forGroup = null;

  if (req.query.group) {
    forGroup = req.query.group;
  }
  return h.view("create_event.njk", {
    event: {},
    forGroup,
    groups
  });
}

async function eventDetail(req, h) {
  const eventService = server.getService("events");
  const event = await eventService.getEventBySlug(req.params.slug);
  let userId = _.get(req, "app.user.id");

  if (!event) {
    return Boom.notFound();
  }
  const viewData = {};

  if (!userId && req.query.invite_key) {
    const user = await server
      .getService("user")
      .findUser({ invite_key: req.query.invite_key });

    if (user) {
      h.loginUser(user);
      userId = user.id;
      viewData.user = user;
    }
  }
  const canViewEvent = await eventService.canUserViewEvent(userId, event.id);

  if (!canViewEvent) {
    return Boom.notFound();
  }

  const statuses = { going: [], maybe: [], declined: [], invited: [] };

  event.invites.reduce((carry, invite) => {
    carry[invite.status].push(invite);

    return carry;
  }, statuses);

  const isPublic = !event.is_private;
  const isOwner = event.creator.id === userId;
  const canInvite = await eventService.canInviteToEvent(event.id, userId);
  const canSeeInvites = canInvite || event.show_participants;

  const invite =
    event.invites.find((invite) => {
      return invite.user_id === userId;
    }) || false;

  return h.view("event_detail.njk", {
    ...viewData,
    event: { ...event, ...statuses },
    path: `/events/${event.slug}`,
    title: event.name,
    canEdit: await eventService.canUserEditEvent(userId, event.id),
    invite,
    canRSVP: await eventService.canRSVPToEvent(event.id, userId),
    canInvite,
    canSeeInvites,
    comments: await eventService.getComments(event.id),
    isCreator: event.creator.id === userId,
    mdDescription: sanitize(event.description)
  });
}

async function editEvent(req, h) {
  const eventService = server.getService("events");
  const event = await eventService.getEventBySlug(req.params.slug);
  if (!event) {
    return Boom.notFound();
  }

  if (!req.loggedIn()) {
    return Boom.notFound();
  }
  const canEdit = await eventService.canUserEditEvent(
    req.app.user.id,
    event.id
  );

  if (!canEdit) {
    return Boom.notFound();
  }
  const groups = await server
    .getService("groups")
    .getGroupsForUser(req.app.user.id);

  let forGroup = null;

  if (req.query.group) {
    forGroup = req.query.group;
  }
  return h.view("create_event.njk", {
    event,
    groups,
    forGroup
  });
}

async function eventDisussion(req, h) {
  const userId = _.get(req, "app.user.id");
  const eventService = server.getService("events");
  const event = await eventService.getEventBySlug(req.params.slug);
  const canView = await eventService.canUserViewEvent(userId, event.id);
  const allComments = await eventService.getComments(event.id);

  if (!canView) {
    return Boom.notFound();
  }

  if (!event.allow_comments) {
    return h.turboRedirect(`/events/${event.slug}`);
  }

  const map = new Map();

  allComments.forEach((c) => {
    map.set(c.id, { ...c, children: [] });
  });

  const comments = [];
  allComments.forEach((c) => {
    c.body = sanitize(c.body);
    if (c.parent_comment) {
      const parent = map.get(c.parent_comment);
      parent.children.push(c);
    } else {
      comments.push(c);
    }
  });

  return h.view("event_discussion.njk", {
    title: `${event.name} Discussion`,
    event,
    comments,
    path: `/events/${event.slug}`
  });
}

module.exports = {
  init
};
