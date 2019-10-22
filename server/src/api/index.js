const joi = require("@hapi/joi");
const PhoneNumber = require("awesome-phonenumber");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const CLIENT_ID =
  "634779035671-htqj3sdamedg2bldv6fa85dr9qv3hh0f.apps.googleusercontent.com";
const client = new OAuth2Client(CLIENT_ID);
const LoginWithTwitter = require("login-with-twitter");
const Boom = require("@hapi/boom");
const sql = require("slonik").sql;
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
            date: joi.date().timestamp(),
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
      path: "/events/{id}/invite",
      handler: inviteToEvent,
      options: {
        validate: {
          payload: joi.object({
            invites: joi.array().items(
              joi
                .object({
                  name: joi.string().allow(null, ""),
                  email: joi.string(),
                  phone: joi.string()
                })
                .or("email", "phone")
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
      path: "/events/{id}/rsvp",
      handler: rsvpToEvent
    });

    server.route({
      method: "POST",
      path: "/groups",
      handler: createGroup,
      options: {
        validate: {
          payload: joi.object({
            name: joi.string().required(),
            descirption: joi.string(),
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
  }
};
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
  const user = req.app.user;
  const events = server.getService("events");

  if (!user) {
    return Boom.unauthorized();
  }

  const canInvite = await events.canRSVPToEvent(req.params.id, user.id);
  if (!canInvite) {
    return Boom.unauthorized();
  }

  await events.rsvpToEvent(
    req.params.id,
    user.id,
    req.payload.status,
    req.payload.show_name
  );

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
    return "Invalid Phone";
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

  return h.redirect("/login/phone");
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

    await h.loginUser(user, false);
    h.unstate("session_key");

    return h.redirect("/");
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

  server.createTask("send-code", {
    code_type: "email",
    user,
    code
  });

  return h.redirect("/login/email");
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

  return h.loginUser(user);
}

const tw = new LoginWithTwitter({
  consumerKey: "zsGP1PcSGDT1DL4HD8snUvqJG",
  consumerSecret: "lHNvtemSECLj891PJXvKZAfPfEDl26Pj5n7hqr8QbY7q1XnZ3c",
  callbackUrl: "http://localhost:8000/api/login/twitter/callback"
});

async function inviteToEvent(req, h) {
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

  events.inviteUsersToEvent(req.params.id, req.payload.invites);

  return h.response().code(204);
}
