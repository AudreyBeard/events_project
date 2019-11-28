import { ApplicationController } from "../helpers/application_controller";

export default class extends ApplicationController {
  toggleInvite() {
    this.toggleTarget("inviteForm");
  }

  async toggleUpdate(e) {
    const forms = this.targets.findAll("roleForm");
    const buttons = this.targets.findAll("roleButton");
    forms.forEach((form) => {
      form.classList.add("hidden");
    });
    buttons.forEach((button) => {
      button.classList.remove("hidden");
    });
    const id = e.target.dataset.for;
    const form = document.getElementById(id);

    e.target.classList.add("hidden");

    form.classList.remove("hidden");

    e.stopPropagation();
  }
  async removeMember(e) {
    e.preventDefault();
    const target = e.target;
    const id = this.data.get("id");
    const user = target.dataset.user;
    this.formControl.hide("management");
    if (user) {
      const req = await this.api.Delete(`/api/groups/${id}/members/${user}`);

      if (req.ok) {
        this.formControl.success("User removed from group", "management");
        this.page.reload();
      } else {
        const res = await req.json();
        this.formControl.error(res.message, "management");

        target.reset();
      }
    }
  }
  async requestDelete() {
    const yes = confirm("Are you sure you want to delete this group?");
    const groupId = this.data.get("id");
    if (yes) {
      await this.api.Delete(`/api/groups/${groupId}`);

      this.page.replace("/groups");
    }
  }

  async updateRole(e) {
    let target = e.target;
    if (target.form) {
      target = target.form;
    }

    const user = target.dataset.user;

    if (user) {
      const id = this.data.get("id");
      const req = await this.api.Post(`/api/groups/${id}/members/${user}`, {
        role: target.role.value
      });

      if (req.ok) {
        this.formControl.hide("management");
        this.formControl.success("User role updated", "management");
        this.page.reload();
      } else {
        const res = await req.json();
        this.formControl.hide("management");
        this.formControl.error(res.message, "management");
        target.reset();
      }
    }
  }
}
