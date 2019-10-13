let server;
const sql = require("slonik").sql;

async function createUser({ provider = {}, email, name, phone }) {
  let field = sql.identifier(["email"]);
  let fieldValue = email;

  if (!email && phone) {
    field = sql.identifier(["phone"]);
    fieldValue = phone;
  }

  const query = await server.app.db.query(
    sql`INSERT INTO users (provider, ${field}, name) values (${sql.json(
      provider
    )}, ${fieldValue}::text, ${name}) returning *`
  );

  return query.rows[0];
}

async function generateLoginToken(userId) {
  const insert = await server.app.db.query(
    sql`insert into logins (user_id, expires) VALUES (${userId}, now() + interval '2w') returning id, expires`
  );
  const tokenData = insert.rows[0];
  const result = {
    token: {
      id: tokenData.id,
      expires: tokenData.expires
    }
  };

  return result;
}

async function findUserByEmail(email) {
  const query = await server.app.db.query(
    sql`SELECT * FROM users where email = ${email}`
  );

  return query.rows[0];
}

async function findUserByPhone(phone) {
  const query = await server.app.db.query(
    sql`SELECT * FROM users where phone = ${phone}`
  );

  return query.rows[0];
}

async function findById(id) {
  const query = await server.app.db.query(
    sql`SELECT * FROM users where id = ${id}`
  );

  return query.rows[0];
}

async function generateOTP(user) {
  const codeArr = [];

  for (let i = 0; i < 6; i++) {
    codeArr.push(Math.floor(Math.random() * 10));
  }

  const code = codeArr.join("");
  console.log(code, user);
  const loginCode = await server.app.db.one(sql`
	INSERT into login_codes (code, user_id) VALUES (${code}, ${user.id}) returning *
	`);

  return { session_key: loginCode.id, code };
}

function init(hapiServer) {
  server = hapiServer;
}

module.exports = {
  findUserByEmail,
  findUserByPhone,
  generateOTP,
  findById,
  generateLoginToken,
  createUser,
  init,
  name: "user"
};
