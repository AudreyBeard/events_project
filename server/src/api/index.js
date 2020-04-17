const joi = require("@hapi/joi");
const _ = require("lodash");
const PhoneNumber = require("awesome-phonenumber");
const crypto = require("crypto");
const fetch = require("node-fetch");
const { OAuth2Client } = require("google-auth-library");
const CLIENT_ID =
  "634779035671-htqj3sdamedg2bldv6fa85dr9qv3hh0f.apps.googleusercontent.com";
const client = new OAuth2Client(CLIENT_ID);
const LoginWithTwitter = require("login-with-twitter");
const Boom = require("@hapi/boom");
const sql = require("slonik").sql;
const { emailOrPhone } = require("../utils");
let server;
module.exports = {
  name: "Api",
  register: async function(hapiServer, options) {
    server = hapiServer;
    server.route({
      method: "POST",
      path: "/events",
      handler: createEvent,
      options: {
        validate: {
          payload: joi.object({
            name: joi.string().required(),
            date: joi
              .date()
              .timestamp()
              .required(),
            end_date: joi.date().timestamp(),
            description: joi.string().required(),
            is_private: joi.boolean(),
            show_participants: joi.boolean(),
            allow_comments: joi.boolean(),
            can_invite: joi.boolean(),
            tz: joi.string(),
            location: joi.string().allow(null, ""),
            group_id: joi
              .string()
              .uuid()
              .allow(null)
          })
        }
      }
    });

    server.route({
      method: "POST",
      path: "/events/{id}/invite",
      handler: inviteToEvent,
      options: {
        validate: {
          payload: joi.object({
            invites: joi.array().items(
              joi
                .object({
                  name: joi.string().allow(null, ""),
                  user_id: joi.string().allow(null, ""),
                  email: joi.string(),
                  phone: joi.string(),
                  message: joi.string().allow(null, "")
                })
                .or("email", "phone", "user_id")
            )
          })
        }
      }
    });

    server.route({
      method: "POST",
      path: "/login/email",
      options: {
        validate: {
          payload: joi.object({
            email: joi
              .string()
              .email()
              .required()
          })
        }
      },
      handler: loginWithEmail
    });

    server.route({
      method: "POST",
      path: "/login/phone",
      options: {
        validate: {
          payload: joi.object({
            phone: joi.string().required()
          })
        }
      },
      handler: loginWithPhone
    });

    server.route({
      method: "POST",
      path: "/login/google",
      handler: loginWithGoogle
    });

    server.route({
      method: "POST",
      path: "/login/otp",
      handler: validateOTPLogin
    });

    server.route({
      method: "POST",
      path: "/events/{id}",
      handler: editEvent,
      options: {
        validate: {
          payload: joi.object({
            name: joi.string().required(),
            date: joi
              .date()
              .timestamp()
              .required(),
            end_date: joi.date().timestamp(),
            tz: joi.string(),
            description: joi.string().required(),
            is_private: joi.boolean(),
            show_participants: joi.boolean(),
            allow_comments: joi.boolean(),
            can_invite: joi.boolean(),
            location: joi.string().allow(null, ""),
            group_id: joi
              .string()
              .uuid()
              .allow(null)
          })
        }
      }
    });

    server.route({
      method: "POST",
      path: "/events/{id}/rsvp",
      handler: rsvpToEvent
    });

    server.route({
      method: "DELETE",
      path: "/events/{id}",
      handler: deleteEvent
    });

    server.route({
      method: "POST",
      path: "/groups",
      handler: createGroup,
      options: {
        validate: {
          payload: joi.object({
            name: joi.string().required(),
            description: joi.string(),
            allow_inviting: joi.boolean(),
            is_private: joi.boolean(),
            custom_path: joi
              .string()
              .pattern(/^[a-z0-9\-]+$/, { name: "Path" })
              .min(3)
              .max(20)
          })
        }
      }
    });

    server.route({
      method: "DELETE",
      path: "/groups/{id}",
      handler: deleteGroup
    });

    server.route({
      method: "POST",
      path: "/groups/{id}",
      handler: updateGroup,
      options: {
        validate: {
          payload: joi.object({
            name: joi.string(),
            description: joi.string(),
            allow_inviting: joi.boolean(),
            is_private: joi.boolean(),
            custom_path: joi
              .string()
              .pattern(/^[a-z0-9\-]+$/, { name: "Path" })
              .min(3)
              .max(20)
          })
        }
      }
    });

    server.route({
      method: "POST",
      path: "/groups/{id}/members",
      handler: addUserToGroup,
      options: {
        validate: {
          payload: joi
            .object({
              name: joi.string(),
              email: joi.string(),
              phone: joi.string(),
              role: joi
                .string()
                .valid("member", "moderator", "admin")
                .default("member")
            })
            .or("email", "phone")
        }
      }
    });

    server.route({
      method: "POST",
      path: "/groups/{id}/members/{memberId}",
      handler: updateGroupMember
    });

    server.route({
      method: "DELETE",
      path: "/groups/{id}/members/{memberId}",
      handler: deleteGroupMember
    });

    server.route({
      method: "POST",
      path: "/groups/createPost",
      handler: createPostInGroup,
      options: {
        validate: {
          payload: joi.object({
            groupId: joi.string().required(),
            body: joi.string().required()
          })
        }
      }
    });

    server.route({
      method: "POST",
      path: "/groups/createComment",
      handler: createCommentOnPostInGroup,
      options: {
        validate: {
          payload: joi.object({
            groupId: joi.string().required(),
            postId: joi.string().required(),
            body: joi.string().required()
          })
        }
      }
    });

    server.route({
      method: "POST",
      path: "/invites/{id}/resend",
      handler: resendInvite
    });

    server.route({
      method: "POST",
      path: "/events/{id}/comments",
      handler: commentOnEvent,
      options: {
        validate: {
          payload: joi.object({
            body: joi.string().required(),
            parent: joi
              .string()
              .uuid()
              .allow(null)
          })
        }
      }
    });
    server.route({
      method: "DELETE",
      path: "/events/{id}/comments/{comment_id}",
      handler: deleteComment
    });
    server.route({
      method: "POST",
      path: "/inbound",
      handler: inboundEmail
    });

    server.route({
      method: "POST",
      path: "/settings",
      handler: updateSettings
    });

    server.route({
      method: "POST",
      path: "/settings/view_message",
      handler: markMessageAsViewed
    });

    server.route({
      method: "POST",
      path: "/settings/tz",
      handler: userTzPing
    });

    server.route({
      method: "POST",
      path: "/mutual-aid/update-volunteer",
      handler: updateMutualAidVolunteer
    });
  }
};

async function updateMutualAidVolunteer(req, h) {
  const [
    { requests, headerInverted, dataRowStart },
    err
  ] = await server.getService("groups").getMutualAidRequests();

  const volunteerIndex = headerInverted["Volunteer Working"];

  let col = [];
  let index = 0;
  let n = volunteerIndex + 1;
  while (n > 0) {
    let remainder = n % 26;
    if (remainder === 0) {
      col[index] = "Z";
      n = ~~(n / 26 - 1);
    } else {
      col[index] = String.fromCharCode(remainder - 1 + "A".charCodeAt(0));
      n = ~~(n / 26);
    }
    index += 1;
  }

  let offset = 0;
  requests.forEach((request, index) => {
    if (request[headerInverted["Request ID"]] === req.payload.id) {
      offset = index;
    }
  });
  const row = offset + dataRowStart;

  const cell = `${col.reverse().join("")}${row}`;
  await server
    .getService("groups")
    .updateMutualAidCell(cell, req.payload.volunteer);

  return {
    status: "active"
  };
}

async function createPostInGroup(req, h) {
  if (!req.loggedIn()) {
    return Boom.unauthorized();
  }

  const groupService = server.getService("groups");
  const canPost = await groupService.canUserPostInGroup(
    req.userId(),
    req.payload.groupId
  );

  if (!canPost) {
    return Boom.unauthorized();
  }

  const post = await groupService.createPost(
    req.userId(),
    req.payload.groupId,
    req.payload.body
  );

  return post;
}

async function createCommentOnPostInGroup(req, h) {
  if (!req.loggedIn()) {
    return Boom.unauthorized();
  }

  const groupService = server.getService("groups");

  const canPost = await groupService.canUserPostInGroup(
    req.userId(),
    req.payload.groupId
  );

  if (!canPost) {
    return Boom.unauthorized();
  }

  const comment = await groupService.createComment(
    req.userId(),
    req.payload.groupId,
    req.payload.postId,
    req.payload.body
  );

  return comment;
}

async function deleteComment(req, h) {
  if (!req.loggedIn()) {
    return Boom.unauthorized();
  }

  const can = await server
    .getService("events")
    .canUserDeleteComment(req.params.id, req.params.comment_id, req.userId());

  if (!can) {
    return Boom.unauthorized();
  }

  await server
    .getService("events")
    .deleteComment(req.params.id, req.params.comment_id);

  return h.noContent();
}

async function userTzPing(req, h) {
  const user = req.app.user;

  if (req.userId()) {
    if (!user.settings.timezone) {
      await server.getService("user").updateUser(user.id, {
        timezone: req.payload.timezone
      });
    }
  }

  return h.response().code(204);
}

async function markMessageAsViewed(req, h) {
  if (!req.userId()) {
    return Boom.forbidden();
  }
  await server
    .getService("user")
    .markMessageAsViewed(req.userId(), req.payload.id);

  return h.response().code(204);
}

async function deleteGroup(req, h) {
  const groupService = server.getService("groups");

  const userId = req.userId();
  const groupId = req.params.id;
  const canDelete = await groupService.canUserDeleteGroup(userId, groupId);

  if (!canDelete) {
    return Boom.unauthorized();
  }

  await groupService.deleteGroup(groupId);

  return h.response().code(204);
}

async function deleteGroupMember(req, h) {
  const groupService = server.getService("groups");
  const userId = req.userId();

  const group = await groupService.getGroup(req.params.id);

  if (!group) {
    return Boom.notFound();
  }

  const canDelete = await groupService.canUserRemoveMember(
    userId,
    group.id,
    req.params.memberId
  );

  if (!canDelete) {
    return Boom.unauthorized("You don't have permission to remove that user");
  }

  await groupService.removeGroupMember(req.params.memberId, group.id);

  return h.response().code(204);
}

async function updateGroupMember(req, h) {
  const groupService = server.getService("groups");
  const userId = _.get(req, "app.user.id");

  const group = await groupService.getGroup(req.params.id);

  if (!group) {
    return Boom.notFound();
  }

  const canUpdate = await groupService.canUserUpdateRole(
    userId,
    group.id,
    req.params.memberId,
    req.payload.role
  );

  if (!canUpdate) {
    return Boom.unauthorized();
  }

  await groupService.updateUserRole(
    req.params.memberId,
    group.id,
    req.payload.role
  );

  return h.response().code(204);
}

async function deleteEvent(req, h) {
  const eventService = server.getService("events");
  const userId = _.get(req, "app.user.id");
  const event = await eventService.getEventById(req.params.id);

  if (!event) {
    return Boom.notFound();
  }

  const canDelete = await eventService.canUserDeleteEvent(userId, event.id);

  if (!canDelete) {
    return Boom.unauthorized();
  }

  await eventService.deleteEvent(event.id);

  return h.response().code(204);
}

async function updateGroup(req, h) {
  const groupService = server.getService("groups");
  const group = await groupService.getGroup(req.params.id);
  const userId = _.get(req, "app.user.id");

  if (!group) {
    return Boom.notFound();
  }

  const canEdit = await groupService.canUserEditGroup(userId, group.id);

  if (!canEdit) {
    return Boom.unauthorized();
  }

  const [err, update] = await groupService.updateGroup(group.id, req.payload);

  if (err) {
    return Boom.badRequest(err);
  }

  return update;
}

async function updateSettings(req, h) {
  const user = req.app.user;
  if (!user) {
    return Boom.unauthorized();
  } else {
    const result = await server
      .getService("user")
      .updateUser(req.app.user.id, req.payload);

    if (result && result.must_validate) {
      return {
        must_validate: result.must_validate
      };
    } else {
      return h.response({}).code(200);
    }
  }
}

async function inboundEmail(req, h) {
  const key = req.query.key;

  if (key === process.env.INBOUND_EMAIL_KEY) {
    server.createTask("inbound-email", req.payload);
    return h.response().code(200);
  } else {
    return Boom.forbidden();
  }
}

async function commentOnEvent(req, h) {
  const eventService = server.getService("events");
  const userId = _.get(req, "app.user.id");
  const event = await eventService.getEventById(req.params.id);
  if (!event) {
    return Boom.notFound();
  }
  const canView = await eventService.canUserViewEvent(userId, event.id);

  if (!canView) {
    return Boom.notFound();
  }

  if (!event.allow_comments) {
    return Boom.unauthorized();
  }

  const comment = await eventService.createComment(
    userId,
    event.id,
    req.payload.parent,
    req.payload.body
  );

  return comment;
}

async function resendInvite(req, h) {
  const user = req.app.user;
  const events = server.getService("events");

  if (!user) {
    return Boom.unauthorized();
  }

  const invite = await events.getInvite(req.params.id);

  if (!invite) {
    return Boom.notFound();
  }

  const canInvite = await events.canInviteToEvent(
    invite.event_id,
    req.app.user.id
  );

  if (!canInvite) {
    return Boom.unauthorized();
  }

  await events.resendInvite(invite.id);

  return h.response().code(204);
}

async function editEvent(req, h) {
  const eventService = server.getService("events");
  const event = await eventService.getEventById(req.params.id);
  if (!event) {
    return Boom.notFound();
  }

  if (!req.loggedIn()) {
    return Boom.unauthorized();
  }
  const canEdit = await eventService.canUserEditEvent(
    req.app.user.id,
    event.id
  );

  if (!canEdit) {
    return Boom.unauthorized();
  }

  const canCreate = await eventService.canCreateForGroup(
    req.app.user.id,
    req.payload.group_id
  );

  if (!canCreate) {
    return Boom.unauthorized();
  }
  const updatedEvent = await eventService.editEvent(req.params.id, req.payload);

  return updatedEvent;
}
async function addUserToGroup(req, h) {
  const userService = server.getService("user");
  const groupService = server.getService("groups");

  if (!req.app.user) {
    return Boom.unauthorized();
  }

  const allowed = await groupService.canAddUserToGroup(
    req.app.user.id,
    req.params.id,
    req.payload.role
  );

  if (!allowed) {
    return Boom.unauthorized();
  }

  let addedUser = await userService.findUser({
    email: req.payload.email,
    phone: req.payload.phone
  });

  if (!addedUser) {
    addedUser = await userService.createUser({
      email: req.payload.email,
      phone: req.payload.phone
    });
  }

  const [err] = await groupService.addUserToGroup(
    addedUser.id,
    req.params.id,
    req.payload.role
  );

  if (err) {
    return Boom.badRequest(err);
  }

  return h.response().code(204);
}

async function createGroup(req, h) {
  const user = req.app.user;

  if (!user) {
    return Boom.unauthorized();
  }

  const payload = {
    creator: user.id,
    ...req.payload
  };

  const [err, data] = await server.getService("groups").createGroup(payload);
  if (err) {
    return Boom.badRequest(err);
  }
  return data;
}

async function rsvpToEvent(req, h) {
  let user = req.app.user;
  const events = server.getService("events");
  const userService = server.getService("user");

  const event = await events.getEventById(req.params.id);

  if (!event) {
    return Boom.notFound();
  }

  if (!user && req.payload.email_or_phone) {
    const { type, value } = emailOrPhone(req.payload.email_or_phone);
    user = await userService.findOrCreateUser({
      name: req.payload.name,
      [type]: value
    });
  }

  if (!user) {
    return Boom.unauthorized();
  }

  const canRSVP = await events.canRSVPToEvent(
    req.params.id,
    user.id,
    req.payload.event_key
  );
  if (!canRSVP) {
    return Boom.unauthorized();
  }

  if (req.payload.name && !user.name) {
    server.getService("user").setName(user.id, req.payload.name);
  }

  await events.rsvpToEvent({
    eventId: req.params.id,
    userId: user.id,
    status: req.payload.status,
    response: req.payload.response,
    show_name: req.payload.show_name,
    event_key: req.payload.event_key
  });

  return h.response().code(204);
}

async function createEvent(req, h) {
  const events = server.getService("events");

  const canCreate = await events.canCreateForGroup(
    req.app.user.id,
    req.payload.group_id
  );

  if (!canCreate) {
    return Boom.unauthorized();
  }

  const result = await events.createEvent(req.app.user, req.payload);

  return result;
}

async function loginWithPhone(req, h) {
  const userService = server.getService("user");
  const phone = new PhoneNumber(
    req.payload.phone,
    PhoneNumber.getRegionCodeForCountryCode(1)
  );

  if (!phone.isValid()) {
    return Boom.badRequest("Not a valid phone number");
  }

  const number = phone.getNumber("e164");

  let user = await userService.findUserByPhone(number);
  if (!user) {
    //Create the user;
    user = await userService.createUser({
      phone: number,
      name: ""
    });
  }

  const { session_key, code } = await userService.generateOTP(user);

  h.state("session_key", session_key);

  server.createTask("send-code", {
    code_type: "sms",
    user,
    code
  });

  return {
    type: "phone"
  };
}

async function validateOTPLogin(req, h) {
  const otp = req.payload.code;
  const token = await server.app.db.query(
    sql`SELECT * from login_codes where code=${otp} and id=${req.state.session_key} and used is null`
  );

  if (!token.rows.length) {
    return Boom.unauthorized();
  } else {
    const userService = server.getService("user");
    const userId = token.rows[0].user_id;
    const user = await userService.findById(userId);

    await server.app.db.query(
      sql`Update login_codes set used = now() where id=${token.rows[0].id}`
    );
    h.unstate("session_key");
    return h.loginAndRedirectUser(user, true);
  }
}

async function loginWithEmail(req, h) {
  const userService = server.getService("user");

  let user = await userService.findUserByEmail(req.payload.email);

  if (!user) {
    //Create the user;
    user = await userService.createUser({
      email: req.payload.email,
      name: ""
    });
  }

  const { session_key, code } = await userService.generateOTP(user);

  h.state("session_key", session_key);
  let code_type = "email";
  let redirectType = "email";
  if (user.phone) {
    code_type = "sms";
    redirectType = "phone";
  }

  server.createTask("send-code", {
    code_type,
    user,
    code
  });

  return {
    type: redirectType
  };
}

async function loginWithGoogle(req, h) {
  const token = req.payload.token;

  const ticket = await client.verifyIdToken({
    idToken: token,
    audience: CLIENT_ID
  });

  const payload = ticket.getPayload();

  let user = await server
    .getService("user")
    .findUserByProvider("google", payload.sub);

  if (!user) {
    //create the user;
    user = await server.getService("user").createUser({
      provider: {
        google: payload.sub
      },
      email: payload.email,
      name: payload.name
    });
  }

  return h.loginAndRedirectUser(user);
}

const tw = new LoginWithTwitter({
  consumerKey: "zsGP1PcSGDT1DL4HD8snUvqJG",
  consumerSecret: "lHNvtemSECLj891PJXvKZAfPfEDl26Pj5n7hqr8QbY7q1XnZ3c",
  callbackUrl: "http://localhost:8000/api/login/twitter/callback"
});

async function inviteToEvent(req, h) {
  try {
    const events = server.getService("events");
    if (!req.loggedIn()) {
      return Boom.unauthorized();
    }
    const canInvite = await events.canInviteToEvent(
      req.params.id,
      req.app.user.id
    );
    if (!canInvite) {
      return Boom.unauthorized();
    }

    events.inviteUsersToEvent(req.params.id, req.payload.invites, req.userId());

    return h.response().code(204);
  } catch (e) {
    console.log(e);
  }
}
