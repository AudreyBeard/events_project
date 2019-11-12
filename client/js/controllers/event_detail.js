import { ApplicationController } from "../helpers/application_controller";

export default class extends ApplicationController {
  connect() {
    const form = this.targets.find("rsvpForm");
    const show_name = form.show_name.checked;
    const hasRSVPd = form.rsvp.value;
    if (show_name && hasRSVPd) {
      this.showTarget("privateInfo");
    } else {
      this.hideTarget("privateInfo");
    }
  }
  async changeRSVP(e) {
    e.preventDefault(e);
    this.toggleRSVP();
  }

  toggleRSVP() {
    this.toggleTarget("hasRSVP");
    this.toggleTarget("rsvpForm");
  }

  async rsvp(e) {
    e.preventDefault();
    this.formControl.hide("rsvp");
    const form = this.targets.find("rsvpForm");

    const rsvp = form.rsvp.value;
    const hide_name = form.show_name.checked;
    const eventId = form.eventId.value;

    if (!rsvp) {
      return;
    }

    const payload = {
      status: rsvp,
      show_name: !hide_name
    };

    if (form.name.value) {
      payload.name = form.name.value;
    }

    await this.api.Post(`/api/events/${eventId}/rsvp`, payload);
    this.formControl.success("RSVP saved!", "rsvp");
    this.page.reload();
    this.hideTarget("rsvpForm");
    if (hide_name) {
      this.showTarget("privateInfo");
    } else {
      this.hideTarget("privateInfo");
    }
  }

  async resend(e) {
    const target = e.target;

    const invite = target.dataset.id;

    const res = await this.api.Post(`/api/invites/${invite}/resend`);

    if (res.ok) {
      this.formControl.success("Invite Resent!", "resend");
    }
  }

  disconnect() {
    this.hideTarget("inviteSent");
  }
}
