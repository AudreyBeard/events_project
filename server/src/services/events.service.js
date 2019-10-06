let server;
const slugify = require("slugify");
const crypto = require("crypto");
function getAllEvents() {
  return [];
}

async function canUserViewEvent(user) {
  return true;
}
async function getEventBySlug(slug) {
  const data = await server.app.db.query(
    "SELECT * from events where slug = $1",
    [slug]
  );
  const userService = server.getService("user");

  if (!data.rows.length) {
    return null;
  }
  const event = data.rows[0];
  event.creator = await userService.findById(event.creator);
  return event;
}

async function getAllEventsForUser(user) {
  const data = await server.app.db.query(`
	SELECT * from events
	`);

  return data.rows;
}

async function createEvent(user, event) {
  const user_id = user.id;
  const id = crypto.randomBytes(4).toString("hex");
  const slug = `${slugify(event.name, { lower: true })}-${id}`;
  const result = await server.app.db.query(
    `
	INSERT into events (name, description, creator, slug) VALUES ($1, $2, $3, $4) returning *
	`,
    [event.name, event.description, user_id, slug]
  );

  return result.rows[0];
}

function init(hapiServer) {
  server = hapiServer;
  //set up database
  //
}

module.exports = {
  getAllEventsForUser,
  getAllEvents,
  createEvent,
  getEventBySlug,
  canUserViewEvent,
  init,
  name: "events"
};
