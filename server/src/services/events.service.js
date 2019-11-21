let server;
const _ = require("lodash");
const slugify = require("slugify");
const crypto = require("crypto");
const sql = require("slonik").sql;
const PhoneNumber = require("awesome-phonenumber");
const { normalizePhone } = require("../utils");

async function canUserViewEvent(userId, eventId, event_key) {
  const event = await server.app.db.maybeOne(
    sql`select id, is_private, creator from events where id=${eventId}`
  );

  if (!event) {
    return false;
  }

  if (!event.is_private) {
    return true;
  }

  if (event_key) {
    return server.app.db.maybeOne(
      sql`select * from events where secret_key=${event_key}`
    );
  }

  if (!userId) {
    return false;
  }

  if (event.creator === userId) {
    return true;
  }

  const invited = await server.app.db.maybeOne(
    sql`select * from invites where user_id=${userId} and event_id=${eventId}`
  );

  if (invited) {
    return true;
  }

  const inGroup = await server.app.db.maybeOne(
    sql`select * from events e inner join groups g on g.id = e.group_id inner join group_members gm on gm.group_id = g.id where gm.user_id=${userId}`
  );

  if (inGroup) {
    return true;
  }

  return false;
}
async function getEventBySlug(slug) {
  const data = await server.app.db.query(
    sql`SELECT * from events where slug = ${slug}`
  );

  return formatEvent(data.rows[0]);
}

async function getEventById(id) {
  const event = await server.app.db.maybeOne(
    sql`select * from events where id=${id}`
  );
  return formatEvent(event);
}

async function formatEvent(event) {
  if (!event) {
    return null;
  }
  const userService = server.getService("user");
  event.creator = await userService.findById(event.creator);
  event.invites = await getEventInvites(event.id);
  return event;
}

async function getEventInvites(id) {
  const attendees = await server.app.db.query(
    sql`SELECT *, row_to_json((select d from (select * from users where id = i.user_id) d)) as user from invites i where event_id = ${id}`
  );

  return attendees.rows;
}
const cache = {};
async function findEvents(constraints) {
  const where = [sql`is_private = false`];
  if (constraints) {
    if (constraints.user) {
      where.pop();
      where.push(
        sql`(${sql.join(
          [
            sql`creator = ${constraints.user}`,
            sql`id in (select event_id from invites where user_id = ${constraints.user})`,
            sql`is_private = false`,
            sql`${constraints.user} in (select gm.user_id from group_members gm where gm.group_id = e.group_id)`
          ],
          sql` OR `
        )})`
      );
    } else {
      where.push(sql`is_private = false`);
    }

    if (constraints.maxAge) {
      where.push(sql`date > now() - ${constraints.maxAge}::interval`);
    }
    if (constraints.maxUntil) {
      where.push(sql`date < now() + ${constraints.maxUntil}::interval`);
    }

    if (constraints.future) {
      where.push(sql`date > now()`);
    }
  }
  const query = sql`SELECT *,
		(
			select json_agg(r) from (
				select * from invites where event_id = e.id
			) r
		) invites
		from events e where ${sql.join(where, sql` AND `)}  order by date`;

  const events = await server.app.db.query(query);

  const upcoming = [];
  const past = [];

  events.rows.forEach((event) => {
    const date = new Date(event.date);

    if (date >= Date.now()) {
      upcoming.push(event);
    } else {
      past.push(event);
    }
  });

  return { upcoming, past };
}

async function getGroupEventsForUser(groupId, userId) {
  const group = await server.app.db.maybeOne(
    sql`Select * from groups where id=${groupId}`
  );

  if (!group) {
    return [];
  }

  const inGroup = await server.app.db.maybeOne(
    sql`select * from group_members where group_id=${groupId} and user_id=${userId}`
  );

  if (inGroup) {
    return server.app.db.any(
      sql`select * from events where group_id = ${groupId} and date > now()`
    );
  } else {
    if (!group.is_private) {
      return server.app.db.any(
        sql`select * from events where group_id=${groupId} and is_private=FALSE and date > now()`
      );
    } else {
      return [];
    }
  }
}

async function canInviteToEvent(eventId, user) {
  const event = await server.app.db.maybeOne(
    sql`SELECT * from events where id=${eventId}`
  );
  if (!event) {
    return false;
  }

  if (event.creator === user) {
    return true;
  } else if (event.can_invite) {
    return true;
  } else {
    return false;
  }
}

async function inviteUsersToEvent(eventId, users) {
  try {
    const eventQuery = await server.app.db.query(
      sql`SELECT e.*, row_to_json((select d from (select * from users where id = e.creator) d)) as creator from events e where id = ${eventId}`
    );
    if (!eventQuery.rows) {
      return null;
    }

    const userQuery = sql`SELECT * from users where email = ANY (${sql.array(
      users
        .map((user) => {
          return user.email;
        })
        .filter((value) => !!value),
      "text"
    )}) or phone = ANY (${sql.array(
      users
        .map((user) => {
          if (user.phone) {
            return normalizePhone(user.phone);
          }
        })
        .filter((value) => !!value),
      "text"
    )})`;

    const existing = await server.app.db.query(userQuery);

    //If we don't have a user entry for someone we need to create it...
    const notFound = users.filter((user) => {
      const found = existing.rows.find((queryUser) => {
        const phone = normalizePhone(queryUser.phone);
        const userPhone = normalizePhone(user.phone);
        return phone === userPhone || queryUser.email === user.email;
      });

      return !found;
    });

    let newUsers = [];
    if (notFound.length) {
      const queried = notFound.map((user) => {
        let phone = null;
        if (user.phone) {
          phone = normalizePhone(user.phone);
        }
        return [user.name || "", user.email, phone];
      });

      const otherUsers = await server.app.db.query(
        sql`INSERT INTO users (name, email, phone) select * from ${sql.unnest(
          queried,
          ["text", "text", "text"]
        )} returning *`
      );
      newUsers = otherUsers.rows;
    }

    const allUsers = [...existing.rows, ...newUsers];
    const allUsersFragment = allUsers.map((user) => {
      const key = crypto.randomBytes(16).toString("hex");
      const result = [user.id, eventId, key, "invited"];
      return result;
    });
    const inviteesQuery = sql`INSERT INTO invites (user_id, event_id, invite_key, status) select * from ${sql.unnest(
      allUsersFragment,
      ["uuid", "uuid", "text", "text"]
    )} ON CONFLICT DO NOTHING returning *`;

    const invitees = await server.app.db.query(inviteesQuery);
    console.log(allUsers);
    allUsers.forEach((user) => {
      const invite = invitees.rows.find((invite) => {
        return invite.user_id === user.id;
      });
      if (!invite) {
        //They were likely invited before
        console.log("no invite");
        return;
      }
      server.createTask("invite-user-to-event", {
        event: eventQuery.rows[0],
        invite,
        link: `https://junipercity.com/events/${eventQuery.rows[0].slug}?invite_key=${invite.invite_key}`,
        user
      });
    });
  } catch (e) {
    console.log(e);
  }
}

async function resendInvite(inviteId) {
  const invite = await server.app.db.maybeOne(
    sql`select * from invites where id=${inviteId}`
  );
  if (!invite) {
    return;
  }

  const event = await server.app.db.maybeOne(
    sql`select * from events where id=${invite.event_id}`
  );

  const user = await server.app.db.maybeOne(
    sql`select * from users where id = ${invite.user_id}`
  );
  server.createTask("invite-user-to-event", {
    event,
    invite,
    link: `https://junipercity.com/events/${event.slug}?invite_key=${invite.invite_key}`,
    user
  });
}

async function createEvent(user, event) {
  const user_id = user.id;
  const id = crypto.randomBytes(4).toString("hex");
  const slug = `${slugify(event.name, { lower: true })}-${id}`;

  const validFields = [
    "name",
    "description",
    "location",
    "date",
    "is_private",
    "allow_comments",
    "show_participants",
    "group_id",
    "source",
    "email_message_id"
  ];
  const fields = [sql.identifier(["slug"]), sql.identifier(["creator"])];
  const values = [slug, user_id];

  validFields.forEach((f) => {
    if (event.hasOwnProperty(f)) {
      fields.push(sql.identifier([f]));
      if (f !== "date") {
        values.push(event[f]);
      } else {
        values.push(sql`to_timestamp(${event["date"] / 1000})`);
      }
    }
  });
  const result = await server.app.db.query(
    sql`
	INSERT into events (${sql.join(fields, sql`, `)}) VALUES (${sql.join(
      values,
      `, `
    )}) returning *
	`
  );
  server.createTask("event-created", {
    event: result.rows[0]
  });

  return result.rows[0];
}

async function canCreateForGroup(user, group) {
  if (!group) {
    return true;
  }
  if (!user) {
    return false;
  }
  const data = await server.app.db.maybeOne(
    sql`SELECT * from group_members where group_id=${group} and user_id=${user} and role >= 'moderator'`
  );

  if (!data) {
    return false;
  }

  return true;
}

async function canRSVPToEvent(eventId, userId, event_key) {
  const event = await server.app.db.maybeOne(
    sql`SELECT * from events where id = ${eventId}`
  );

  const invites = await server.app.db.any(
    sql`SELECT * from invites where event_id=${eventId}`
  );
  if (event_key && event.secret_key === event_key) {
    return true;
  }

  if (!event) {
    return false;
  }

  const isOwner = event.creator === userId;

  const isInvited = invites.find((invite) => {
    return invite.user_id === userId;
  });

  const isPublic = !event.is_private;

  return (isOwner || isInvited || isPublic) && userId;
}

async function rsvpToEvent(eventId, userId, status, show_name, event_key) {
  const event = await server.app.db.maybeOne(
    sql`select * from events where id=${eventId}`
  );

  if (!event) {
    return;
  }
  const invite = await server.app.db.maybeOne(
    sql`select * from invites where user_id = ${userId} and event_id=${eventId}`
  );
  const notCreator = event.creator !== userId;
  const wrongKey = event_key !== event.secret_key;

  if (!invite && event.is_private && notCreator && wrongKey) {
    return;
  }

  //Create or update an invite
  const key = crypto.randomBytes(16).toString("hex");
  const res = await server.app.db.maybeOne(
    sql`INSERT INTO invites (user_id, event_id, invite_key, status, show_name) values (${userId}, ${eventId}, ${key}, ${status}, ${show_name}) ON CONFLICT (user_id, event_id) DO UPDATE set status = ${status}, show_name = ${show_name} returning *`
  );

  server.createTask("user-did-rsvp", {
    event,
    user: await server.getService("user").findById(userId),
    invite: res
  });
}

async function canUserEditEvent(user, event) {
  //Right now only the creator
  if (!user) {
    return false;
  }
  return server.app.db.maybeOne(
    sql`select * from events where creator = ${user} and id=${event}`
  );
}

async function editEvent(eventId, payload) {
  const sets = [];
  const allowedFields = [
    "name",
    "can_invite",
    "is_private",
    "description",
    {
      name: "date",
      format: (date) => {
        return sql`to_timestamp(${new Date(date).getTime() / 1000})`;
      }
    },
    "location",
    "group_id",
    "allow_comments",
    "show_participants"
  ];

  allowedFields.forEach((field) => {
    const key = field.name || field;
    if (_.has(payload, key)) {
      const format = field.format || ((val) => val);
      sets.push(sql`${sql.identifier([key])}=${format(payload[key])}`);
    }
  });

  return server.app.db.maybeOne(
    sql`Update events set ${sql.join(
      sets,
      sql` , `
    )} where id=${eventId} returning *`
  );
}

async function getInvite(inviteId) {
  return server.app.db.maybeOne(
    sql`Select * from invites where id=${inviteId}`
  );
}

async function getComments(eventId) {
  return server.app.db.any(
    sql`SELECT *, 
		row_to_json((select d from (select * from users where id = c.user_id) d)) as user 
		from comments c 
		where entity_id=${eventId} order by created desc`
  );
}

async function createComment(userId, eventId, parentId, body) {
  const parent = parentId || null;
  return server.app.db.maybeOne(
    sql`INSERT INTO comments 
		(user_id, entity_id, parent_comment, body) 
		VALUES (${userId}, ${eventId}, ${parent}, ${body}) 
		returning *`
  );
}

async function canUserDeleteEvent(userId, eventId) {
  if (!userId) {
    return false;
  }
  const creator = await server.app.db.maybeOne(
    sql`select * from events where creator = ${userId} and id=${eventId}`
  );

  if (!creator) {
    const group = await server.app.db.maybeOne(
      sql`select * from events 
			inner join group_members g on g.group_id = events.group_id
			where events.id=${eventId} and g.user_id= ${userId} and g.role > 'moderator'`
    );

    if (group) {
      return true;
    } else {
      return false;
    }
  } else {
    return true;
  }
}

async function deleteEvent(eventId) {
  //Delete invites
  await server.app.db.query(sql`delete from invites where event_id=${eventId}`);
  //Delete the comments
  await server.app.db.query(
    sql`delete from comments where entity_id=${eventId}`
  );
  //Delete the event
  await server.app.db.query(sql`delete from events where id=${eventId}`);
}

async function getEventsCommentDigest() {
  return server.app.db.any(
    sql`
		with updated_comments as (
		update comments set notified = TRUE where notified is FALSE returning *
		)
		select u.*, (
			select json_agg(e) from (
				select events.*, (
					select json_agg(c) from (
						select comments.*, (
							select row_to_json(commentor) from (
								select * from users where users.id = comments.user_id
							) commentor
						) creator
						from comments where entity_id = events.id and notified = FALSE
					) c
				) as comments
				from events
				inner join updated_comments on updated_comments.entity_id = events.id
				inner join invites ii on ii.event_id = events.id
				where ii.user_id = u.id or events.creator = u.id
				group by events.id
			) e
		) as events
		from users u where exists (
			select * from updated_comments uc
			inner join events on events.id = uc.entity_id
			inner join invites r on uc.entity_id = r.event_id
			where 
			(events.creator = u.id or r.user_id = u.id) and uc.user_id != u.id
		)
		`
  );
}

function getEventByEmailHash(hash) {
  return server.app.db.maybeOne(
    sql`select * from events where email_hash_id = ${hash}`
  );
}

function init(hapiServer) {
  server = hapiServer;
  //set up database
  //
}

module.exports = {
  name: "events",
  inviteUsersToEvent,
  canInviteToEvent,
  canRSVPToEvent,
  rsvpToEvent,
  canUserEditEvent,
  editEvent,
  createEvent,
  getEventBySlug,
  findEvents,
  canUserViewEvent,
  canCreateForGroup,
  init,
  getEventById,
  getInvite,
  getGroupEventsForUser,
  resendInvite,
  getComments,
  createComment,
  getEventsCommentDigest,
  canUserDeleteEvent,
  deleteEvent,
  getEventByEmailHash
};
