import { Meteor } from "meteor/meteor";
import { StatusCollection } from "/imports/api/status/status";

Meteor.publish("app.status", function publishAppStatus() {
  return StatusCollection.find({}, { limit: 1 });
});
