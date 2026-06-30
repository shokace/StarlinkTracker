import { Meteor } from "meteor/meteor";
import { DDPRateLimiter } from "meteor/ddp-rate-limiter";
import { Match, check } from "meteor/check";
import { validateNoradId } from "/imports/api/satellites/validation";

Meteor.methods({
  "satellites.toggleFavorite"(payload) {
    check(
      payload,
      Match.ObjectIncluding({
        noradId: Match.Integer,
        isFavorite: Boolean,
      }),
    );
    validateNoradId(payload.noradId);

    return {
      mode: this.userId ? "account-backed" : "local-only",
      noradId: payload.noradId,
      isFavorite: payload.isFavorite,
    };
  },
});

DDPRateLimiter.addRule(
  {
    type: "method",
    name: "satellites.toggleFavorite",
    userId() {
      return true;
    },
  },
  120,
  60 * 1000,
);
