const fetch = require("node-fetch");
module.exports = (server) => async (job) => {
  try {
    const type = job.data.type;
    const data = job.data.taskData;
    if (type === "send-code") {
      if (data.code_type === "sms") {
        const user = data.user;
        try {
          const res = await sendText(
            user.phone,
            `You Juniper City login code is: ${data.code}`
          );
          console.log(res);
        } catch (e) {
          console.log(e);
        }
      }
    }

    if (type === "invite-user-to-event") {
      const user = data.user;
      if (user.phone) {
        try {
          const shortlink = await server
            .getService("shortlinks")
            .create(data.link);

          const link = `https://junipercity.com/s/${shortlink.key}`;
          const res = await sendText(
            user.phone,
            `You have been invited to an event on Juniper City: ${link}`
          );
          console.log(res);
        } catch (e) {
          console.log(e);
        }
      }
    }

    if (type === "send-validation") {
      if (data.validation.phone) {
        const shortlink = await server
          .getService("shortlinks")
          .create(data.link);
        const link = `https://junipercity.com/s/${shortlink.key}`;
        const res = await sendText(
          data.validation.phone,
          `Validate your phone on Juniper City ${link}`
        );

        console.log(res);
      }
    }

    if (type === "event-comments") {
      if (data.user.phone) {
        try {
          await sendText(
            data.user.phone,
            `New comments your events in Juniper City https://junipercity.com/`
          );
        } catch (e) {
          console.log(e);
        }
      }
    }

    if (type === "notify-group-member-about-event") {
      if (data.member.phone) {
        try {
          const idOrCustom = data.group.custom_path || data.group.id;
          const shortlink = await server
            .getService("shortlinks")
            .create(`https://junipercity.com/groups/${idOrCustom}/events`);
          const link = `https://junipercity.com/s/${shortlink.key}`;
          await sendText(
            data.member.phone,
            `New event in your Juniper City Group ${link}`
          );
        } catch (e) {
          console.log(e);
        }
      }
    }

    if (type === "user-added-to-group") {
      if (data.user.phone) {
        const idOrCustom = data.group.custom_path || data.group.id;
        const key = await server
          .getService("shortlinks")
          .create(
            `https://junipercity.com/groups/${idOrCustom}?member_key=${data.member.member_key}`
          );
        const link = `https://junipercity.com/s/${key.key}`;
        await sendText(
          data.user.phone,
          `You were invited to the group: ${data.group.name} on Juniper City ${link}`
        );
      }
    }
  } catch (e) {
    console.log(e);
  }
};

async function sendText(phone, message) {
  const req = await fetch("https://textbelt.com/text", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: `phone=${encodeURIComponent(phone)}&message=${encodeURIComponent(
      message
    )}&key=${process.env.TEXTBELT_API_KEY}`
  });

  const json = await req.json();
  console.log(json);
  return json;
}
