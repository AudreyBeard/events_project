const vision = require("@hapi/vision");
const inert = require("@hapi/inert");
const ejs = require("ejs");
const path = require("path");
const fns = require("date-fns");

let server;

module.exports = {
  name: "views",
  register: async (hapiServer, options) => {
    server = hapiServer;

    await server.register(vision);
    await server.register(inert);

    server.views({
      engines: { ejs },
      relativeTo: path.join(__dirname, "../../../", "templates"),
      context: (req) => ({
        date: fns,
        user: req.app.user,
        loggedIn: !!req.app.user
      }),
      isCached: process.env.NODE_ENV !== "develop"
    });

    //The source map url gets mapped wrong from parcel...
    //I still like source maps so here it is
    server.route({
      method: "GET",
      path: "/static/main.css.map",
      handler: {
        file: path.join(__dirname, "../../../", "client", "css", "main.css.map")
      }
    });
    server.route({
      method: "GET",
      path: "/static/{param*}",
      handler: {
        directory: {
          path: path.join(__dirname, "../../../", "client"),
          listing: true
        }
      }
    });

    server.route({
      method: "GET",
      path: "/",
      handler: homepage
    });

    server.route({
      method: "GET",
      path: "/create",
      handler: createEvent
    });

    server.route({
      method: "GET",
      path: "/login",
      handler: login
    });

    server.route({
      method: "GET",
      path: "/login/{type}",
      handler: loginWithOTP
    });

    server.route({
      method: "GET",
      path: "/events/{slug}",
      handler: eventDetail
    });
  }
};

async function loginWithOTP(req, h) {
  const type = req.params.type;
  let codeSource = "Phone";
  if (type === "email") {
    codeSource = "Email";
  }
  return h.view("login_otp", { codeSource });
}

async function eventDetail(req, h) {
  const eventService = server.getService("events");
  const canView = await eventService.canUserViewEvent(req.app.user);
  const event = await eventService.getEventBySlug(req.params.slug);

  if (!event) {
    return "NO EVENT";
  }

  const statuses = { going: [], maybe: [], declined: [], invited: [] };

  event.invites.reduce((carry, invite) => {
    carry[invite.status].push(invite);

    return carry;
  }, statuses);

  return h.view("event_detail", { event: { ...event, ...statuses } });
}

async function homepage(req, h) {
  const options = {};
  if (req.app.user) {
    options.user = req.app.user.id;
  }
  const events = await server.getService("events").findEvents(options);
  return h.view("homepage", { events });
}

async function createEvent(req, h) {
  return h.view("create");
}

async function login(req, h) {
  if (!req.app.user) {
    return h.view("login");
  } else {
    return h.redirect("/");
  }
}
