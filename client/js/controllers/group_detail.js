import { ApplicationController } from "../helpers/application_controller";

export default class extends ApplicationController {
  toggleInvite() {
    this.toggleTarget("inviteForm");
  }
}
